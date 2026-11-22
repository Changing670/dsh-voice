/**
 * Pure-function tests for the proper-noun matcher.
 *
 * The matcher lives inside the browser bundle, so this harness slices the
 * `terms:begin/end` block out of client.js and evaluates it in Node. No browser,
 * no audio, no DSH.
 *
 * Run: ELECTRON_RUN_AS_NODE=1 "<DeepSeek Harness.exe>" test/terms.test.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8')

const BEGIN = '/* ==== terms:begin ===='
const END = '/* ==== terms:end ==== */'
const start = source.indexOf(BEGIN)
const end = source.indexOf(END)
if (start < 0 || end < 0) {
  console.error('could not locate the terms block')
  process.exit(1)
}
const block = source.slice(start, end + END.length)
const api = new Function(
  `${block}\nreturn { applyTerms, canonicalOf, learnAlias, TERMS }`,
)()

const positives = [
  ['把 deep seek 的插件改一下', '把 DeepSeek 的插件改一下'],
  ['德普西克最近更新了', 'DeepSeek最近更新了'],
  ['用 gpt 和克劳德对比一下', '用 GPT 和Claude对比一下'],
  ['第普西克的 api 有点慢', 'DeepSeek的 API 有点慢'],
  ['jason 格式不对', 'JSON 格式不对'],
  ['林特报错了', 'lint报错了'],
  ['康密特一下代码', 'commit一下代码'],
  ['deep sick 挺好用', 'DeepSeek 挺好用'],
  ['open ai 的接口', 'OpenAI 的接口'],
  ['vscode 打不开', 'VS Code 打不开'],
  ['chat gpt 的回复', 'ChatGPT 的回复'],
  ['克劳德代码写得不错', 'Claude Code写得不错'],
  ['逼的脚本挂了', 'build脚本挂了'],
  ['肉特配置错了', 'router配置错了'],
]

const negatives = [
  '深度思考一下这个问题',
  '云端同步要做吗',
  '接口设计得改',
  '我的反应有点慢',
  '这个代理不太行',
  '吉他的声音太大了',
  '请把这句话改短一点',
  '插件装好了吗',
  '提交代码之前先看一眼',
  '这个函数太长了',
]

let failures = 0
for (const [input, expected] of positives) {
  const actual = api.applyTerms(input)
  const ok = actual === expected
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${input}  →  ${actual}${ok ? '' : `   (expected: ${expected})`}`)
}

console.log('\n--- negative corpus (must be untouched)')
for (const input of negatives) {
  const actual = api.applyTerms(input)
  const ok = actual === input
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${input}${ok ? '' : `  →  ${actual}`}`)
}

console.log('\n--- learning hook')
const before = api.applyTerms('壳劳德写代码')
const learned = api.learnAlias('壳劳德', api.canonicalOf('claude'))
const after = api.applyTerms('壳劳德写代码')
console.log(`before=${before} learned=${learned} after=${after}`)
if (!learned || after !== 'Claude写代码') failures += 1

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
