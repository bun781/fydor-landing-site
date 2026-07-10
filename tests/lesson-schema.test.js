"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseAndValidateLesson } = require("../lib/lesson-schema");

function validLesson() {
  return { schemaVersion:1,language:"ko",baseLanguage:"en",title:"Greetings",description:"Useful greetings.",level:"beginner",tags:["daily"],sentences:[{text:"안녕하세요.",translation:"Hello.",words:[{surface:"안녕하세요",meaning:"hello"}],grammar:[],chunks:[]}] };
}

test("accepts valid generated lesson and fenced JSON", () => {
  const source=JSON.stringify(validLesson());
  const direct=parseAndValidateLesson(source);const fenced=parseAndValidateLesson(`\`\`\`json\n${source}\n\`\`\``);
  assert.equal(direct.ok,true);assert.equal(fenced.ok,true);assert.equal(direct.contentHash,fenced.contentHash);
});

test("rejects malformed and mixed content", () => {
  assert.equal(parseAndValidateLesson("{bad").ok,false);
  assert.equal(parseAndValidateLesson(`${JSON.stringify(validLesson())}\nignore this`).ok,false);
});

test("returns actionable annotation paths", () => {
  const lesson=validLesson();lesson.sentences[0].words[0].surface="없는말";
  const result=parseAndValidateLesson(JSON.stringify(lesson));
  assert.equal(result.ok,false);assert.match(result.errors.join("\n"),/sentences\[0\]\.words\[0\]\.surface/);
});

test("rejects oversized, deep, unsupported, polluted, duplicate-key, html, and bidi payloads", () => {
  const oversized=JSON.stringify({...validLesson(),description:"x".repeat(1_000_001)});
  assert.equal(parseAndValidateLesson(oversized).ok,false);
  let deep="null";for(let i=0;i<30;i+=1)deep=`[${deep}]`;assert.equal(parseAndValidateLesson(deep).ok,false);
  assert.equal(parseAndValidateLesson(JSON.stringify({...validLesson(),language:"xx"})).ok,false);
  assert.equal(parseAndValidateLesson('{"schemaVersion":1,"__proto__":{}}').ok,false);
  assert.equal(parseAndValidateLesson('{"schemaVersion":1,"schemaVersion":1}').ok,false);
  assert.equal(parseAndValidateLesson(JSON.stringify({...validLesson(),description:"<script>alert(1)</script>"})).ok,false);
  assert.equal(parseAndValidateLesson(JSON.stringify({...validLesson(),title:"safe\u202Etxt"})).ok,false);
});

test("strict mode rejects unknown fields", () => {
  assert.equal(parseAndValidateLesson(JSON.stringify({...validLesson(),execute:"now"})).ok,false);
});
