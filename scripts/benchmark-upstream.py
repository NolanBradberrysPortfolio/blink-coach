"""Headless evaluation of inspected upstream sources, not a production detector.

Runs the upstream Python statements directly. Only camera/keyboard/display I/O
and end-of-frame observation are adapted. No copied upstream code is stored.
Requires local checkouts and the isolated research Python environment.
"""
import ast
import hashlib
import json
import os
import sys
from pathlib import Path
from types import ModuleType

os.environ['MPLBACKEND'] = 'Agg'
import cv2 as real_cv
import mediapipe


class EndOfVideo(Exception):
    pass


def tag_groups(path):
    groups = {}
    for line in Path(path).read_text().splitlines():
        fields = line.strip().split(':')
        if len(fields) >= 7 and fields[0].isdigit() and fields[1].isdigit():
            groups.setdefault(fields[1], []).append(int(fields[0]))
    return sorted(groups.values(), key=lambda group: group[0])


def run(source, video, output, calibration_video=None, calibration_tag=None, fixed=None):
    tree = ast.parse(Path(source).read_text(encoding='utf-8'))
    # Observe the existing frame loop, never rewrite its blink rules.
    frame_loops = [node for node in ast.walk(tree) if isinstance(node, ast.While)
                   and any(isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute)
                           and child.func.attr == 'read' for child in ast.walk(node))]
    if len(frame_loops) != 1:
        raise ValueError('Expected exactly one camera loop')
    frame_loops[0].body.append(ast.parse('__observe(globals())').body[0])
    # The fixed-EAR sample ships with threshold zero. An explicitly named .2
    # configuration is evaluated separately, using the README's stated value.
    if fixed is not None:
        for node in tree.body:
            if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'EAR_THRESH' for t in node.targets):
                node.value = ast.Constant(fixed)
    # Remove plot initialization and plot update only; their data are unrelated
    # to the algorithm and no desktop windows should be opened by a benchmark.
    class NoPlots(ast.NodeTransformer):
        def visit_Assign(self, node):
            if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name) and node.value.func.id == 'init_ear_plot':
                return None
            return self.generic_visit(node)
        def visit_Expr(self, node):
            if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name) and node.value.func.id == 'update_ear_plot':
                return None
            return self.generic_visit(node)
    tree = ast.fix_missing_locations(NoPlots().visit(tree))
    schedule = []
    if calibration_tag:
        # Use five labeled blinks AFTER the evaluated first 900 frames. They
        # are calibration-only, never scored or selected from evaluation labels.
        groups = [g for g in tag_groups(calibration_tag) if g[0] >= 915][:5]
        if len(groups) != 5:
            raise ValueError('Need five separate calibration blinks after excerpt')
        for group in groups:
            schedule.extend((index, index in (group[0]-3, group[-1]+3))
                            for index in range(group[0]-3, group[-1]+4))
    class Capture:
        def __init__(self):
            self.eval = real_cv.VideoCapture(str(video))
            self.cal = real_cv.VideoCapture(str(calibration_video)) if schedule else None
            self.index = -1
            self.cal_index = 0
            self.current_cal = False
            self.key = -1
        def isOpened(self):
            return True
        def read(self):
            self.current_cal = self.cal_index < len(schedule)
            if self.current_cal:
                index, key = schedule[self.cal_index]
                self.cal.set(real_cv.CAP_PROP_POS_FRAMES, index)
                success, frame = self.cal.read()
                self.cal_index += 1
                self.key = ord('1') if key else -1
            else:
                self.index += 1
                self.key = -1
                success, frame = self.eval.read()
            if not success:
                raise EndOfVideo()
            return success, frame
        def get(self, prop):
            return self.eval.get(prop)
        def release(self):
            self.eval.release()
            if self.cal:
                self.cal.release()
    capture = Capture()
    proxy = ModuleType('cv2')
    for name in dir(real_cv):
        setattr(proxy, name, getattr(real_cv, name))
    proxy.VideoCapture = lambda *_args, **_kwargs: capture
    proxy.waitKey = lambda *_args: capture.key
    for name in ['namedWindow', 'imshow', 'destroyAllWindows', 'putText', 'rectangle', 'circle']:
        setattr(proxy, name, lambda *args, **kwargs: None)
    frames, events = [], []
    last_count, first_active = 0, None
    def observe(state):
        nonlocal last_count, first_active
        if capture.current_cal:
            return
        if schedule and state.get('calibration_in_progress'):
            raise ValueError('Upstream calibration did not complete')
        counter = state.get('COUNTER', state.get('frame_count', 0))
        count = state.get('TOTAL_BLINKS', state.get('blink_count', 0))
        simple = 'TOTAL_BLINKS' in state
        active = state.get('eyes_ratio', 0) > 3 if simple else counter > 0
        if first_active is None and active:
            first_active = capture.index
        if count > last_count:
            # Compare event centers, not notification/emission latency.
            start = first_active if first_active is not None else capture.index
            events.append({'startTimestampMs': start * 1000 / 30,
                           'endTimestampMs': capture.index * 1000 / 30,
                           'emittedAtMs': capture.index * 1000 / 30})
        if (simple and not active) or counter == 0:
            first_active = None
        last_count = count
        result = state.get('results')
        frames.append({'timestampMs': capture.index * 1000 / 30,
                       'faceDetected': bool(result and result.multi_face_landmarks),
                       'left': state.get('left_eye_EAR'), 'right': state.get('right_eye_EAR'),
                       'signal': state.get('smoothen_value', state.get('averaged_EAR', state.get('eyes_ratio'))),
                       'threshold': state.get('EAR_THRESH', 3), 'counter': counter, 'count': count})
        if capture.index % 300 == 0:
            print(Path(source).name, Path(video).name, capture.index, flush=True)
    sys.modules['cv2'] = proxy
    namespace = {'__name__': '__benchmark__', '__observe': observe, 'print': lambda *args, **kwargs: None}
    error = None
    try:
        exec(compile(tree, str(source), 'exec'), namespace)
    except EndOfVideo:
        pass
    except Exception as exc:
        error = f'{type(exc).__name__}: {exc}'
    finally:
        capture.release()
        if 'face_mesh' in namespace:
            try:
                namespace['face_mesh'].close()
            except ValueError:
                pass
        sys.modules['cv2'] = real_cv
    report = {'source': str(source), 'sourceSha256': hashlib.sha256(Path(source).read_bytes()).hexdigest(),
              'mediapipeVersion': mediapipe.__version__, 'video': str(video),
              'calibrationTag': str(calibration_tag) if calibration_tag else None,
              'calibrationFrames': len(schedule), 'fixedThresholdOverride': fixed,
              'frames': frames, 'events': events, 'error': error}
    Path(output).write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'{Path(source).name}: {len(frames)} frames, {len(events)} events, error={error}', flush=True)
    if error:
        raise RuntimeError(error)


if __name__ == '__main__':
    # JSON manifest avoids shell/path quoting mistakes and records exact inputs.
    manifest = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    for job in manifest:
        run(**job)
