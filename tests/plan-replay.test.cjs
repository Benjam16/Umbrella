'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const plan = require(path.resolve(
  __dirname,
  '../dist/modules/agent-runtime/core/plan-xml-parse.js',
));

test('expandPlanXmlToActions is deterministic for the same XML', () => {
  const xml = `<plan>
<goal>g</goal>
<milestones>
<milestone id="1" name="M">
<slice id="1">
<task><name>t1</name><action>read:foo</action></task>
</slice>
</milestone>
</milestones>
</plan>`;
  const a = plan.expandPlanXmlToActions(xml);
  const b = plan.expandPlanXmlToActions(xml);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(a.length, 1);
  assert.strictEqual(a[0].name, 't1');
  assert.strictEqual(a[0].action, 'read:foo');
});

test('extractGoal and extractSlices are stable', () => {
  const xml = '<plan><goal>  hello  </goal><milestone name="x"><slice id="1"><task><action>shell:echo hi</action></task></slice></milestone></plan>';
  assert.strictEqual(plan.extractGoal(xml), 'hello');
  const slices = plan.extractSlices(xml);
  assert.strictEqual(slices.length, 1);
  const tasks = plan.parseTasksFromXml(slices[0].body);
  assert.strictEqual(tasks[0].action, 'shell:echo hi');
});
