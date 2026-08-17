import { ReminderEngine } from '../reminderEngine';
import { longestNoBlinkInterval, rollingBlinksPerMinute } from '../statistics';

describe('ReminderEngine', () => {
  it('fires after the interval only when active and a face is visible', () => {
    const engine = new ReminderEngine(5000, 12000);
    engine.reset(0);
    expect(engine.evaluate(4999, true, true).shouldTrigger).toBe(false);
    expect(engine.evaluate(5000, false, true).shouldTrigger).toBe(false);
    expect(engine.evaluate(5000, true, false).shouldTrigger).toBe(false);
    expect(engine.evaluate(5000, true, true).shouldTrigger).toBe(true);
  });

  it('does not fire every frame and re-arms after cooldown', () => {
    const engine = new ReminderEngine(5000, 12000);
    engine.reset(0);
    expect(engine.evaluate(5000, true, true).shouldTrigger).toBe(true);
    expect(engine.evaluate(5001, true, true).shouldTrigger).toBe(false);
    expect(engine.evaluate(16999, true, true).shouldTrigger).toBe(false);
    expect(engine.evaluate(17000, true, true).shouldTrigger).toBe(true);
    engine.recordBlink(17500);
    expect(engine.evaluate(20000, true, true).shouldTrigger).toBe(false);
  });
});

describe('rolling statistics', () => {
  it('counts only actual blink timestamps in the rolling minute', () => {
    expect(rollingBlinksPerMinute([1000, 20000, 40000, 61001], 61000)).toBe(3);
  });

  it('finds the longest no-blink interval including session edges', () => {
    expect(longestNoBlinkInterval(0, 20000, [3000, 9000])).toBe(11000);
    expect(longestNoBlinkInterval(0, 20000, [])).toBe(20000);
  });
});
