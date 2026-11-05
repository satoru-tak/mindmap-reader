/**
 * End-to-end test of every command (keyboard shortcuts, buttons, drag, files).
 *
 *   npm run build && npx vite preview --port 4173   # in one terminal
 *   npm run test:e2e                                # in another
 *
 * Needs the `playwright` package and its Chromium (npx playwright install chromium).
 * Each test starts from a fresh browser profile with the default reading map:
 *   本のタイトル
 *   ├ 第1章 ─ 要点 / 引用 / 気づき
 *   ├ 全体の気づき・感想
 *   └ 全体で行動に移すこと
 * ⌘ (Meta) and Ctrl are both tested for shortcuts that use them.
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// require() so a globally installed playwright (NODE_PATH) also works
const { chromium } = createRequire(import.meta.url)('playwright')

const URL = process.env.APP_URL || 'http://localhost:4173/'
const only = process.argv[2]

// ---------- helpers that run in the page ----------
const h = {
  /** nested outline of the current map: "本のタイトル(第1章(要点,引用,気づき),…)" */
  tree: (p) =>
    p.evaluate(() => {
      const s = window.__mindmap.getState()
      const m = s.maps[s.currentMapId]
      const walk = (id) => {
        const n = m.nodes[id]
        const kids = n.children.map(walk)
        return n.text + (kids.length ? `(${kids.join(',')})` : '')
      }
      return walk(m.rootId)
    }),
  kids: (p, text) =>
    p.evaluate((text) => {
      const s = window.__mindmap.getState()
      const m = s.maps[s.currentMapId]
      const n = Object.values(m.nodes).find((x) => x.text === text)
      return n ? n.children.map((c) => m.nodes[c].text) : null
    }, text),
  node: (p, text) =>
    p.evaluate((text) => {
      const s = window.__mindmap.getState()
      const m = s.maps[s.currentMapId]
      return Object.values(m.nodes).find((x) => x.text === text) ?? null
    }, text),
  selected: (p) =>
    p.evaluate(() => {
      const s = window.__mindmap.getState()
      const m = s.maps[s.currentMapId]
      return s.selectedId ? m.nodes[s.selectedId]?.text ?? null : null
    }),
  editing: (p) => p.evaluate(() => !!window.__mindmap.getState().editingId),
  state: (p, key) => p.evaluate((key) => window.__mindmap.getState()[key], key),
  mapCount: (p) => p.evaluate(() => Object.keys(window.__mindmap.getState().maps).length),
  mode: (p) =>
    p.evaluate(() => {
      const s = window.__mindmap.getState()
      return s.maps[s.currentMapId].mode
    }),
  toast: (p) => p.locator('.toast').textContent({ timeout: 1500 }).catch(() => null),
}
const click = (p, text) => p.locator('.mind-node', { hasText: new RegExp(`^${text}`) }).first().click()
const pause = (p, ms = 120) => p.waitForTimeout(ms)
/** サイドバーの「⚙ 設定」を開く（ファイル・テーマ・明るさ） */
const openSettings = async (p) => {
  if ((await p.locator('.settings-toggle').getAttribute('aria-expanded')) !== 'true') await p.click('.settings-toggle')
}

// ---------- tiny assertion lib ----------
class Fail extends Error {}
const eq = (actual, expected, what) => {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new Fail(`${what}\n      期待: ${e}\n      実際: ${a}`)
}

const tests = []
const test = (name, fn) => tests.push({ name, fn })
/** run the same test once with ⌘ (Meta) and once with Ctrl */
const testMod = (name, fn) => {
  test(`${name}（⌘）`, (p) => fn(p, 'Meta'))
  test(`${name}（Ctrl）`, (p) => fn(p, 'Control'))
}

// =====================================================================
// 追加・編集
// =====================================================================
test('Tab：詳しく（子）を追加して入力できる', async (p) => {
  await click(p, '要点')
  await p.keyboard.press('Tab')
  eq(await h.editing(p), true, '追加後すぐ入力状態')
  await p.keyboard.type('A')
  await p.keyboard.press('Enter')
  eq(await h.kids(p, '要点'), ['A'], '要点の下にA')
})

test('Enter：下に並べて（兄弟）を追加', async (p) => {
  await click(p, '要点')
  await p.keyboard.press('Enter')
  await p.keyboard.type('B')
  await p.keyboard.press('Enter')
  eq(await h.kids(p, '第1章'), ['要点', 'B', '引用', '気づき'], '要点の下にB')
})

test('Shift+Enter：上に並べて（兄弟）を追加', async (p) => {
  await click(p, '引用')
  await p.keyboard.press('Shift+Enter')
  await p.keyboard.type('上')
  await p.keyboard.press('Enter')
  eq(await h.kids(p, '第1章'), ['要点', '上', '引用', '気づき'], '引用の上に追加')
})

testMod('⌘/Ctrl+Enter：まとめる（親を挿入）', async (p, mod) => {
  await click(p, '引用')
  await p.keyboard.press(`${mod}+Enter`)
  await p.keyboard.type('まとめ')
  await p.keyboard.press('Enter')
  eq(await h.kids(p, '第1章'), ['要点', 'まとめ', '気づき'], '第1章の並び')
  eq(await h.kids(p, 'まとめ'), ['引用'], 'まとめの下に引用')
})

test('Enter をタイトルで押す → 詳しくを追加', async (p) => {
  await click(p, '本のタイトル')
  await p.keyboard.press('Enter')
  await p.keyboard.type('X')
  await p.keyboard.press('Enter')
  eq((await h.kids(p, '本のタイトル')).at(-1), 'X', 'タイトルの最後にX')
})

for (const [key, label] of [
  ['Space', 'Space'],
  ['F2', 'F2'],
]) {
  test(`${label}：編集を始める`, async (p) => {
    await click(p, '要点')
    await p.keyboard.press(key)
    eq(await h.editing(p), true, '編集中')
    await p.keyboard.press('End')
    await p.keyboard.type('2')
    await p.keyboard.press('Enter')
    eq(await h.kids(p, '第1章'), ['要点2', '引用', '気づき'], '書き換え')
  })
}

test('ダブルクリック：編集を始める', async (p) => {
  await p.locator('.mind-node', { hasText: /^要点/ }).dblclick()
  eq(await h.editing(p), true, '編集中')
})

test('入力中 Shift+Enter：改行', async (p) => {
  await click(p, '要点')
  await p.keyboard.press('Space')
  await p.keyboard.press('End')
  await p.keyboard.press('Shift+Enter')
  await p.keyboard.type('二行目')
  await p.keyboard.press('Enter')
  eq((await h.kids(p, '第1章'))[0], '要点\n二行目', '改行が入る')
})

test('入力中 Esc：変更を取り消す', async (p) => {
  await click(p, '要点')
  await p.keyboard.press('Space')
  await p.keyboard.type('変更')
  await p.keyboard.press('Escape')
  eq(await h.kids(p, '第1章'), ['要点', '引用', '気づき'], '元のまま')
})

test('入力中 Tab：確定してさらに詳しくを追加', async (p) => {
  await click(p, '要点')
  await p.keyboard.press('Tab')
  await p.keyboard.type('A')
  await p.keyboard.press('Tab')
  await p.keyboard.type('A1')
  await p.keyboard.press('Enter')
  eq(await h.kids(p, 'A'), ['A1'], 'A の下に A1')
})

test('日本語変換中の Enter では確定しない', async (p) => {
  await click(p, '要点')
  await p.keyboard.press('Space')
  await p.locator('.mind-editor').evaluate((el) => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229, bubbles: true }))
  })
  eq(await h.editing(p), true, '変換中は編集が続く')
})

test('空のまま Enter：消えて元の項目に戻る', async (p) => {
  await click(p, '引用')
  await p.keyboard.press('Enter')
  await p.keyboard.press('Enter')
  eq(await h.kids(p, '第1章'), ['要点', '引用', '気づき'], '空の項目は消える')
  eq(await h.selected(p), '引用', '元の項目に戻る')
})

test('空のまま Esc：消えて元の項目に戻る', async (p) => {
  await click(p, '引用')
  await p.keyboard.press('Tab')
  await p.keyboard.press('Escape')
  eq(await h.kids(p, '引用'), [], '空の項目は消える')
  eq(await h.selected(p), '引用', '元の項目に戻る')
})

test('Enter の押し間違い → 空のまま Tab で詳しくに変わる', async (p) => {
  await click(p, '引用')
  await p.keyboard.press('Enter')
  await p.keyboard.press('Tab')
  await p.keyboard.type('詳')
  await p.keyboard.press('Enter')
  eq(await h.kids(p, '引用'), ['詳'], '引用の下に追加')
  eq(await h.kids(p, '第1章'), ['要点', '引用', '気づき'], '並びは増えない')
})

test('Tab の押し間違い → 空のまま Shift+Tab で並べてに変わる', async (p) => {
  await click(p, '引用')
  await p.keyboard.press('Tab')
  await p.keyboard.press('Shift+Tab')
  await p.keyboard.type('並')
  await p.keyboard.press('Enter')
  eq(await h.kids(p, '第1章'), ['要点', '引用', '並', '気づき'], '引用の下に並ぶ')
  eq(await h.kids(p, '引用'), [], '詳しくは増えない')
})

for (const key of ['Delete', 'Backspace']) {
  test(`${key}：削除（タイトルは消せない）`, async (p) => {
    await click(p, '引用')
    await p.keyboard.press(key)
    eq(await h.kids(p, '第1章'), ['要点', '気づき'], '引用が消える')
    eq(await h.selected(p), '気づき', '次の項目を選択')
    await click(p, '本のタイトル')
    await p.keyboard.press(key)
    eq((await h.tree(p)).startsWith('本のタイトル('), true, 'タイトルは残る')
  })
}

// =====================================================================
// 選択の移動
// =====================================================================
test('← →：まとめ側 / 詳しい側（前にいた項目に戻る）', async (p) => {
  await click(p, '引用')
  await p.keyboard.press('ArrowLeft')
  eq(await h.selected(p), '第1章', '← で第1章')
  await p.keyboard.press('ArrowRight')
  eq(await h.selected(p), '引用', '→ で前にいた引用')
})

test('↑ ↓：同じ深さの上下（並びをまたぐ）', async (p) => {
  await click(p, '要点')
  await p.keyboard.press('ArrowDown')
  eq(await h.selected(p), '引用', '↓')
  await p.keyboard.press('ArrowUp')
  eq(await h.selected(p), '要点', '↑')
  await click(p, '第1章')
  await p.keyboard.press('ArrowDown')
  eq(await h.selected(p), '全体の気づき・感想', '↓（深さ1）')
})

testMod('⌘/Ctrl+↑↓：深さに関係なく、読む順で前・次の項目へ', async (p, mod) => {
  await click(p, '気づき') // 第1章 > 気づき（深さ2）
  await p.keyboard.press(`${mod}+ArrowDown`)
  eq(await h.selected(p), '全体の気づき・感想', '次は深さ1の全体の気づき・感想')
  await p.keyboard.press(`${mod}+ArrowUp`)
  eq(await h.selected(p), '気づき', '前で戻る')
  await click(p, '要点')
  await p.keyboard.press(`${mod}+ArrowUp`)
  eq(await h.selected(p), '第1章', '要点の前は第1章')
  await p.keyboard.press(`${mod}+ArrowUp`)
  eq(await h.selected(p), '本のタイトル', '第1章の前はタイトル')
  await click(p, '全体で行動に移すこと')
  await p.keyboard.press(`${mod}+ArrowDown`)
  eq(await h.selected(p), '全体で行動に移すこと', '最後ではそれ以上動かない')
})

test('Shift+←：枝の先頭 → もう一度でタイトル', async (p) => {
  await click(p, '引用')
  await p.keyboard.press('Tab')
  await p.keyboard.type('深い')
  await p.keyboard.press('Enter')
  await p.keyboard.press('Shift+ArrowLeft')
  eq(await h.selected(p), '第1章', '枝の先頭')
  await p.keyboard.press('Shift+ArrowLeft')
  eq(await h.selected(p), '本のタイトル', 'タイトル')
})

test('Shift+→：来た道をたどって枝の先端へ', async (p) => {
  await click(p, '引用')
  await p.keyboard.press('Tab')
  await p.keyboard.type('深い')
  await p.keyboard.press('Enter')
  await p.keyboard.press('Shift+ArrowLeft')
  await p.keyboard.press('Shift+ArrowLeft')
  await p.keyboard.press('Shift+ArrowRight')
  eq(await h.selected(p), '深い', '元いた先端に戻る')
})

test('Shift+↑↓：並びの先頭 / 末尾', async (p) => {
  await click(p, '引用')
  await p.keyboard.press('Shift+ArrowDown')
  eq(await h.selected(p), '気づき', '末尾')
  await p.keyboard.press('Shift+ArrowUp')
  eq(await h.selected(p), '要点', '先頭')
})

for (const key of ['h', 'H', 'Home']) {
  test(`${key}：タイトルに戻る`, async (p) => {
    await click(p, '引用')
    await p.keyboard.press(key === 'H' ? 'Shift+H' : key)
    eq(await h.selected(p), '本のタイトル', 'タイトルを選択')
  })
}

test('何も選んでいないとき矢印キー → タイトルを選択', async (p) => {
  await p.mouse.click(1150, 140) // 背景
  eq(await h.selected(p), null, '選択なし')
  await p.keyboard.press('ArrowRight')
  eq(await h.selected(p), '本のタイトル', 'タイトル')
})

// =====================================================================
// 並べ替え・整理
// =====================================================================
test('Option/Alt+↑↓：並びの中で順番を入れ替え', async (p) => {
  await click(p, '引用')
  await p.keyboard.press('Alt+ArrowUp')
  eq(await h.kids(p, '第1章'), ['引用', '要点', '気づき'], '上へ')
  await p.keyboard.press('Alt+ArrowUp')
  eq(await h.kids(p, '第1章'), ['引用', '要点', '気づき'], '先頭ではそれ以上動かない')
  await p.keyboard.press('Alt+ArrowDown')
  await p.keyboard.press('Alt+ArrowDown')
  eq(await h.kids(p, '第1章'), ['要点', '気づき', '引用'], '下へ2回')
  eq(await h.selected(p), '引用', '選択はついてくる')
})

test('/：たたむ・ひらく、→ でもひらく', async (p) => {
  await click(p, '第1章')
  await p.keyboard.press('/')
  eq((await h.node(p, '第1章')).collapsed, true, 'たたむ')
  eq(await p.locator('.mind-node', { hasText: /^要点/ }).count(), 0, '中身が見えない')
  await p.keyboard.press('/')
  eq((await h.node(p, '第1章')).collapsed, false, 'ひらく')
  await p.keyboard.press('/')
  await p.keyboard.press('ArrowRight')
  eq((await h.node(p, '第1章')).collapsed, false, '→ でひらく')
})

test('ボタンでたたむ：そのノードが選ばれ、画面上の位置が変わらない（タイトルに飛ばない）', async (p) => {
  await click(p, '要点')
  await p.keyboard.press('Tab')
  await p.keyboard.type('A')
  await p.keyboard.press('Enter')
  await p.keyboard.press('Escape')
  await click(p, '本のタイトル')
  // 画面をずらして、タイトルを左端に寄せる
  await p.mouse.move(900, 600)
  await p.mouse.down()
  await p.mouse.move(620, 600, { steps: 8 })
  await p.mouse.up()
  await pause(p, 300)
  const box = () => p.locator('.mind-node', { hasText: /^要点/ }).first().boundingBox()
  const before = await box()
  await p.locator('.mind-node', { hasText: /^要点/ }).first().locator('.collapse-btn').click()
  await pause(p, 600)
  eq((await h.node(p, '要点')).collapsed, true, 'たたまれる')
  eq(await h.selected(p), '要点', 'たたんだノードが選ばれる')
  const after = await box()
  eq([Math.round(after.x - before.x), Math.round(after.y - before.y)], [0, 0], '画面上の位置が変わらない')
  await p.locator('.mind-node', { hasText: /^要点/ }).first().locator('.collapse-btn').click()
  await pause(p, 600)
  const again = await box()
  eq([Math.round(again.x - before.x), Math.round(again.y - before.y)], [0, 0], 'ひらいても位置が変わらない')
})

test('たたむと、中にあった選択はたたんだノードへ移る', async (p) => {
  await click(p, '第1章')
  await p.keyboard.press('ArrowRight')
  eq(await h.selected(p), '要点', '要点を選択')
  await p.locator('.mind-node', { hasText: /^第1章/ }).first().locator('.collapse-btn').click()
  eq(await h.selected(p), '第1章', '第1章へ移る')
})

testMod('⌘/Ctrl+/：たたむ・ひらく', async (p, mod) => {
  await click(p, '第1章')
  await p.keyboard.press(`${mod}+/`)
  eq((await h.node(p, '第1章')).collapsed, true, 'たたむ')
})

testMod('⌘/Ctrl+C → V：枝ごとコピーして貼り付け（引用・ページも）', async (p, mod) => {
  await click(p, '引用')
  await p.keyboard.press('q')
  await p.keyboard.press('p')
  await p.keyboard.type('12')
  await p.keyboard.press('Enter')
  await click(p, '第1章')
  await p.keyboard.press(`${mod}+c`)
  await click(p, '全体で行動に移すこと')
  await p.keyboard.press(`${mod}+v`)
  await pause(p, 250)
  eq(await h.kids(p, '全体で行動に移すこと'), ['第1章'], '貼り付け先')
  const copies = await p.evaluate(() => {
    const s = window.__mindmap.getState()
    const m = s.maps[s.currentMapId]
    return Object.values(m.nodes).filter((n) => n.text === '引用').map((n) => [n.kind ?? '', n.page ?? ''])
  })
  eq(copies, [['quote', '12'], ['quote', '12']], '引用とページも複製')
})

testMod('⌘/Ctrl+X：切り取り → V で移動', async (p, mod) => {
  await click(p, '引用')
  await p.keyboard.press(`${mod}+x`)
  eq(await h.kids(p, '第1章'), ['要点', '気づき'], '切り取り')
  await click(p, '全体の気づき・感想')
  await p.keyboard.press(`${mod}+v`)
  await pause(p, 250)
  eq(await h.kids(p, '全体の気づき・感想'), ['引用'], '貼り付け')
})

testMod('⌘/Ctrl+D：複製', async (p, mod) => {
  await click(p, '引用')
  await p.keyboard.press(`${mod}+d`)
  eq(await h.kids(p, '第1章'), ['要点', '引用', '引用', '気づき'], 'すぐ下に複製')
})

testMod('⌘/Ctrl+V：ほかのアプリの箇条書き・見出しを貼り付け', async (p, mod) => {
  await click(p, '全体の気づき・感想')
  await p.evaluate(() => {
    const dt = new DataTransfer()
    dt.setData('text/plain', '# 外部\n- A\n  - A1\n- B')
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  void mod
  eq(await h.kids(p, '全体の気づき・感想'), ['外部'], '見出し')
  eq(await h.kids(p, '外部'), ['A', 'B'], '箇条書き')
  eq(await h.kids(p, 'A'), ['A1'], '字下げ')
})

testMod('⌘/Ctrl+Z / Shift+Z：元に戻す / やり直す', async (p, mod) => {
  await click(p, '引用')
  await p.keyboard.press('Delete')
  await p.keyboard.press(`${mod}+z`)
  eq(await h.kids(p, '第1章'), ['要点', '引用', '気づき'], '元に戻す')
  await p.keyboard.press(`${mod}+Shift+z`)
  eq(await h.kids(p, '第1章'), ['要点', '気づき'], 'やり直す')
})

test('Ctrl+Y：やり直す', async (p) => {
  await click(p, '引用')
  await p.keyboard.press('Delete')
  await p.keyboard.press('Control+z')
  await p.keyboard.press('Control+y')
  eq(await h.kids(p, '第1章'), ['要点', '気づき'], 'やり直す')
})

test('ドラッグ：別の項目に重ねて移動 / 自分の先には移動できない', async (p) => {
  const box = async (t) => p.locator('.mind-node', { hasText: new RegExp(`^${t}`) }).first().boundingBox()
  const drag = async (from, to) => {
    const a = await box(from)
    const b = await box(to)
    await p.mouse.move(a.x + 10, a.y + a.height / 2)
    await p.mouse.down()
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 })
    const hint = await p.locator('.drag-hint').textContent()
    await p.mouse.up()
    await pause(p, 300)
    return hint
  }
  const hint = await drag('全体で行動に移すこと', '要点')
  eq(hint.includes('要点'), true, '案内文に移動先が出る')
  eq(await h.kids(p, '要点'), ['全体で行動に移すこと'], '移動した')
  const hint2 = await drag('第1章', '引用')
  eq(hint2.includes('移動できません'), true, '自分の先には移動できない案内')
  eq(await h.kids(p, '本のタイトル'), ['第1章', '全体の気づき・感想'], '構造は変わらない')
})

// =====================================================================
// 読書モード
// =====================================================================
test('Q：引用 ⇄ 自分の言葉', async (p) => {
  await click(p, '要点')
  await p.keyboard.press('q')
  eq((await h.node(p, '要点')).kind, 'quote', '引用')
  await p.keyboard.press('Shift+Q')
  eq((await h.node(p, '要点')).kind ?? null, null, '自分の言葉')
})

test('P：ページ番号（全角・逆順・p. 付きを整える）', async (p) => {
  await click(p, '要点')
  await p.keyboard.press('p')
  await p.keyboard.type('p.４５ー４２')
  await p.keyboard.press('Enter')
  eq((await h.node(p, '要点')).page, '42-45', '42-45 に整う')
  eq(await p.locator('.page-badge').first().textContent(), 'p.42-45', '表示')
})

test('C：章を追加（次の番号、型つき、名前を続けて入力）', async (p) => {
  await p.keyboard.press('c')
  await p.keyboard.type(' 名前')
  await p.keyboard.press('Enter')
  eq(await h.kids(p, '本のタイトル'), ['第1章', '第2章 名前', '全体の気づき・感想', '全体で行動に移すこと'], '第1章の次')
  eq(await h.kids(p, '第2章 名前'), ['要点', '引用', '気づき'], '型')
})

test('シンプルモードでは Q / P / C が効かない', async (p) => {
  await p.click('.mode-switch >> text=シンプル')
  await click(p, '要点')
  await p.keyboard.press('q')
  await p.keyboard.press('c')
  eq((await h.node(p, '要点')).kind ?? null, null, 'Q 無効')
  eq((await h.kids(p, '本のタイトル')).length, 3, 'C 無効')
})

// =====================================================================
// ファイル
// =====================================================================
testMod('⌘/Ctrl+Shift+S：書き出し → ⌘/Ctrl+O で読み込み', async (p, mod) => {
  const [dl] = await Promise.all([p.waitForEvent('download'), p.keyboard.press(`${mod}+Shift+s`)])
  const file = path.join(os.tmpdir(), `mm-e2e-${Date.now()}.mindmap.json`)
  await dl.saveAs(file)
  eq(JSON.parse(fs.readFileSync(file, 'utf8')).maps.length, 1, '1件書き出し')
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.keyboard.press(`${mod}+o`)])
  await fc.setFiles(file)
  await pause(p, 300)
  eq(await h.mapCount(p), 2, '新しいマップとして追加')
})

testMod('⌘/Ctrl+S：自動保存の案内（ブラウザの保存画面は出さない）', async (p, mod) => {
  await p.keyboard.press(`${mod}+s`)
  eq((await h.toast(p))?.includes('自動'), true, '案内が出る')
})

test('サイドバー：すべてバックアップ', async (p) => {
  await openSettings(p)
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('text=すべてバックアップ')])
  eq(dl.suggestedFilename().startsWith('mindmap-backup-'), true, 'ファイル名')
})

// =====================================================================
// ボタン・画面
// =====================================================================
test('ツールバー：→ 詳しく / ↓ 並べて / まとめる / 編集 / 削除', async (p) => {
  await click(p, '要点')
  await p.click('text=→ 詳しく')
  await p.keyboard.type('A')
  await p.keyboard.press('Enter')
  await p.click('text=↓ 並べて')
  await p.keyboard.type('B')
  await p.keyboard.press('Enter')
  await p.click('.toolbar >> text=まとめる')
  await p.keyboard.type('M')
  await p.keyboard.press('Enter')
  eq(await h.kids(p, '要点'), ['A', 'M'], '詳しく・まとめる')
  eq(await h.kids(p, 'M'), ['B'], 'まとめた中身')
  await p.click('.toolbar >> text=削除')
  eq(await h.kids(p, '要点'), ['A'], '削除')
})

test('ツールバー：元に戻す / やり直す / 中心へ / 全体表示', async (p) => {
  await click(p, '引用')
  await p.keyboard.press('Delete')
  await p.click('button[title^="元に戻す"]')
  eq(await h.kids(p, '第1章'), ['要点', '引用', '気づき'], '元に戻す')
  await p.click('button[title^="やり直す"]')
  eq(await h.kids(p, '第1章'), ['要点', '気づき'], 'やり直す')
  await p.click('text=中心へ')
  eq(await h.selected(p), '本のタイトル', '中心へ')
  await p.click('text=全体表示')
})

test('モード切り替え：読書 ⇄ シンプル（データは残る）', async (p) => {
  await click(p, '要点')
  await p.keyboard.press('p')
  await p.keyboard.type('5')
  await p.keyboard.press('Enter')
  await p.click('.mode-switch >> text=シンプル')
  eq(await h.mode(p), 'free', 'シンプル')
  eq(await p.locator('.page-badge').count(), 0, 'ページ表示が消える')
  await p.click('.mode-switch >> text=読書')
  eq(await p.locator('.page-badge').count(), 1, '戻すと表示')
})

test('画面の明るさ：ライト / ダーク / 自動', async (p) => {
  await openSettings(p)
  await p.click('.theme-seg >> text=ダーク')
  eq(await p.evaluate(() => document.documentElement.dataset.theme), 'dark', 'ダーク')
  await p.click('.theme-seg >> text=ライト')
  eq(await p.evaluate(() => document.documentElement.dataset.theme), 'light', 'ライト')
})

test('見た目のテーマ：切り替え・形・再読み込み後も残る', async (p) => {
  const root = () => p.evaluate(() => ({ ...document.documentElement.dataset }))
  eq((await root()).look, 'simple', '最初はシンプル')
  const radius = () => p.locator('.mind-node', { hasText: /^要点/ }).evaluate((el) => getComputedStyle(el).borderTopLeftRadius)
  eq(await radius(), '8px', 'シンプル＝角丸カード')
  await openSettings(p)
  await p.click('[data-look-id="soft"]')
  eq([(await root()).look, (await root()).shape], ['soft', 'pill'], 'やわらか')
  eq(await radius(), '20px', '丸いノード')
  await p.click('[data-look-id="note"]')
  eq([(await root()).look, (await root()).shape], ['note', 'underline'], 'ノート')
  eq(await p.locator('.react-flow__background pattern line, .react-flow__background pattern path').count() > 0, true, '背景が罫線')
  // 下線は線（SVG）の続きとして描かれ、ノードの下の端にぴったり重なる
  const fit = await p.evaluate(() => {
    const node = [...document.querySelectorAll('.mind-node')].find((n) => n.textContent.startsWith('要点')).getBoundingClientRect()
    // 線の終点（＝下線の右端）が、ノードの右下の角にあるか
    return [...document.querySelectorAll('.react-flow__edge-path')].some((e) => {
      const pt = e.getPointAtLength(e.getTotalLength()).matrixTransform(e.getScreenCTM())
      return Math.abs(pt.x - node.right) < 3 && Math.abs(pt.y - node.bottom) < 2
    })
  })
  eq(fit, true, '線と下線がつながっている')
  const bottom = (t) => p.locator('.mind-node', { hasText: new RegExp(`^${t}`) }).first().evaluate((el) => el.getBoundingClientRect().bottom)
  eq(Math.abs((await bottom('第1章')) - (await bottom('引用'))) < 1, true, '親と真ん中の子の下線が一直線')
  await p.reload()
  await p.waitForSelector('.mind-node')
  eq((await root()).look, 'note', '再読み込み後も残る')
  eq(await p.locator('.settings-toggle').getAttribute('aria-expanded'), 'true', '設定を開いたままにしたことも残る')
  eq(await p.locator('.look-item.on').getAttribute('data-look-id'), 'note', '一覧でも選択中')
  await p.click('[data-look-id="simple"]')
  eq(await radius(), '8px', 'シンプルに戻る')
})

test('⚙ 設定：最初は閉じていて、開くとファイル・テーマ・明るさが出る', async (p) => {
  eq(await p.locator('.settings-toggle').getAttribute('aria-expanded'), 'false', '最初は閉じている')
  eq(await p.locator('.theme-seg').isVisible(), false, '明るさは隠れている')
  eq(await p.locator('text=すべてバックアップ').isVisible(), false, 'ファイルも隠れている')
  await p.click('.settings-toggle')
  eq(await p.locator('.theme-seg').isVisible(), true, '明るさが出る')
  eq(await p.locator('[data-look-id="note"]').isVisible(), true, 'テーマが出る')
  eq(await p.locator('text=すべてバックアップ').isVisible(), true, 'ファイルが出る')
  await p.click('.settings-toggle')
  eq(await p.locator('.theme-seg').isVisible(), false, 'もう一度押すと閉じる')
})

test('⚙ 設定を閉じると、マップ一覧を広く使える（高さ720pxでマップ8個以上）', async (p) => {
  await p.setViewportSize({ width: 1280, height: 720 })
  for (let i = 1; i <= 14; i++) {
    await p.click('text=＋ シンプルマップ')
    await p.keyboard.type('マップ' + i)
    await p.keyboard.press('Enter')
    await p.keyboard.press('Escape')
  }
  await pause(p, 300)
  const shown = await p.evaluate(() => {
    const l = document.querySelector('.map-list')
    const item = l.querySelector('li')
    return Math.floor(l.clientHeight / (item.getBoundingClientRect().height + 2))
  })
  eq(shown >= 8, true, `一覧に見えている数：${shown}`)
  const sb = await p.evaluate(() => { const s = document.querySelector('.sidebar'); return s.scrollHeight <= s.clientHeight })
  eq(sb, true, 'サイドバーからはみ出さない')
})

test('長いタイトル：一覧では1行で右端を薄くして消し、マウスを乗せると全文が出る', async (p) => {
  const long = 'とても長いタイトルの本を読んだときのまとめ・第二版・増補改訂'
  await p.click('text=＋ シンプルマップ')
  await p.keyboard.type(long)
  await p.keyboard.press('Enter')
  await p.keyboard.press('Escape')
  const row = p.locator('.map-list li.active .map-item')
  eq(await row.getAttribute('title'), long, 'マウスを乗せたときの全文')
  const t = await row.locator('.map-title-text').evaluate((el) => ({
    lines: Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight || '20')),
    cut: el.scrollWidth > el.clientWidth,
    fade: getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage,
  }))
  eq(t.cut, true, '1行に収まらない分は切れる')
  eq(/gradient/.test(t.fade), true, '右端を薄くしている')
  const sb = await p.evaluate(() => { const s = document.querySelector('.sidebar'); return s.scrollWidth <= s.clientWidth })
  eq(sb, true, 'サイドバーが横にはみ出さない')
})

test('新しいマップ：読書 / シンプル、削除', async (p) => {
  await p.click('text=＋ シンプルマップ')
  await p.keyboard.type('考え')
  await p.keyboard.press('Enter')
  eq(await h.tree(p), '考え', 'タイトルだけ')
  eq(await h.mapCount(p), 2, '2件')
  await p.locator('.map-list li.active .map-delete').click({ force: true })
  await p.click('text=削除する')
  eq(await h.mapCount(p), 1, '削除')
})

test('C：追加した章が少しの間ハイライトされる', async (p) => {
  await p.keyboard.press('c')
  await pause(p, 200)
  eq(await p.locator('.mind-node.flash').count(), 1, 'ハイライト中')
  await p.keyboard.press('Enter')
  await pause(p, 2000)
  eq(await p.locator('.mind-node.flash').count(), 0, '時間がたつと消える')
})

test('狭い画面：☰ でマップ一覧を開き、選ぶと閉じる / 操作方法も見られる', async (p) => {
  await p.setViewportSize({ width: 600, height: 800 })
  await pause(p, 500) // サイドバーが閉じるアニメーションを待つ
  eq(await p.locator('.menu-btn').isVisible(), true, '☰ が出る')
  const left = () => p.locator('.sidebar').evaluate((el) => Math.round(el.getBoundingClientRect().right))
  eq((await left()) <= 0, true, '最初は隠れている')
  await p.click('.menu-btn')
  await pause(p, 300)
  eq((await left()) > 0, true, '開く')
  await p.click('text=＋ シンプルマップ')
  await pause(p, 300)
  eq((await left()) <= 0, true, 'マップを作ると閉じる')
  await p.keyboard.press('Escape')
  await p.click('.menu-btn')
  await pause(p, 300)
  await p.mouse.click(580, 400) // 背景（暗い部分）
  await pause(p, 300)
  eq((await left()) <= 0, true, '外側を押すと閉じる')
  await p.click('.help-toggle')
  eq(await p.locator('.help').isVisible(), true, '操作方法が見られる')
})

// =====================================================================
// runner
// =====================================================================
const browser = await chromium.launch()
let passed = 0
const failures = []
for (const t of tests) {
  if (only && !t.name.includes(only)) continue
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  try {
    await p.goto(URL)
    await p.waitForSelector('.mind-node')
    await p.evaluate(() => window.__mindmap.getState().setHelpOpen(false))
    await pause(p, 500) // wait for the initial fit-to-view animation
    await t.fn(p)
    if (errors.length) throw new Fail(`画面でエラー: ${errors.join(' / ')}`)
    passed++
    console.log(`  ✓ ${t.name}`)
  } catch (e) {
    failures.push(t.name)
    console.log(`  ✗ ${t.name}\n      ${e instanceof Fail ? e.message : e.stack}`)
  } finally {
    await ctx.close()
  }
}
await browser.close()
console.log(`\n${passed} 件成功 / ${failures.length} 件失敗`)
process.exit(failures.length ? 1 : 0)
