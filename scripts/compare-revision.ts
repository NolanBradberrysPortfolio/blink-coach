import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { BlinkStateMachine } from '../src/domain/blinkStateMachine';
import { DEFAULT_BLINK_CONFIG, EyeFrameResult, BlinkEvent } from '../src/domain/types';
import { VideoAnnotationDocument } from '../src/domain/testLabTypes';
import { compareBlinkEvents } from '../src/domain/testComparison';

async function main(): Promise<void> {
  const [revision, signalsPath, labelsPath, reportPath, currentSignalsPath] = process.argv.slice(2);
  if (!reportPath || !/^[a-zA-Z0-9._/-]+$/.test(revision)) throw new Error('Pass revision signals.json labels.json report.json');
  const historic = (file: string) => execFileSync('git', ['show', `${revision}:${file}`], {encoding:'utf8'});
  const bundled = await build({
    stdin: {contents: historic('src/domain/blinkStateMachine.ts') + '\nexport { DEFAULT_BLINK_CONFIG } from "./types";', resolveDir:path.resolve('src/domain'),loader:'ts'},
    bundle:true,write:false,platform:'node',format:'cjs',
    plugins:[{name:'historical-domain',setup(builder){builder.onLoad({filter:/src[\\/]domain[\\/].*\.ts$/}, async args=>({contents:historic(path.relative(process.cwd(),args.path).replaceAll('\\','/')),loader:'ts'}));}}],
  });
  const historicalModule = {exports:{} as {BlinkStateMachine:typeof BlinkStateMachine;DEFAULT_BLINK_CONFIG:typeof DEFAULT_BLINK_CONFIG}};
  // Execute only the user's local Git revision, bundled in memory; no detector copy is maintained.
  new Function('module','exports',bundled.outputFiles[0].text)(historicalModule,historicalModule.exports);
  const frames = JSON.parse(await readFile(signalsPath,'utf8')) as EyeFrameResult[];
  const currentFrames = currentSignalsPath ? JSON.parse(await readFile(currentSignalsPath,'utf8')) as EyeFrameResult[] : frames;
  if (frames.length !== currentFrames.length || frames.some((frame,index)=>frame.timestampMs !== currentFrames[index].timestampMs)) throw new Error('Before/after frame timelines must match');
  const labels = JSON.parse(await readFile(labelsPath,'utf8')) as VideoAnnotationDocument;
  const truth = labels.events.filter(event=>event.timeMs<=frames.at(-1)!.timestampMs);
  const results: Record<string,unknown> = {revision,frames:frames.length,faceFrames:frames.filter(frame=>frame.faceDetected).length,sameSignals:!currentSignalsPath,currentFaceFrames:currentFrames.filter(frame=>frame.faceDetected).length};
  for(const [name, Machine, config] of [
    ['before',historicalModule.exports.BlinkStateMachine,historicalModule.exports.DEFAULT_BLINK_CONFIG],
    ['after',BlinkStateMachine,DEFAULT_BLINK_CONFIG],
  ] as const){
    const machine=new Machine(config);const events:BlinkEvent[]=[];
    for(const frame of name==='before'?frames:currentFrames){const result=machine.process(frame);if(result.event)events.push(result.event);}
    results[name]=compareBlinkEvents(events,truth,[],config,labels.temporalToleranceMs ?? 350).metrics;
  }
  await writeFile(reportPath,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
