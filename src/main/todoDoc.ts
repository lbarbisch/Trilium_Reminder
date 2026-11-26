import { randomBytes } from 'node:crypto';
import * as cheerio from 'cheerio';
import type { Op, TodoItem } from '../shared/types';

const ID = 'data-list-item-id';
const STATE = 'data-trilium-task-state';

/** Same shape as the IDs CKEditor 5 generates: "e" + 32 hex characters. */
export const newItemId = (): string => 'e' + randomBytes(16).toString('hex');

const load = (html: string) => cheerio.load(html, null, false);
type Doc = ReturnType<typeof load>;
type Sel = ReturnType<Doc>;

const mainList = ($: Doc): Sel => $.root().children('ul.todo-list').first();
const checkbox = (li: Sel): Sel => li.children('label').children('input[type="checkbox"]');

function findItem($: Doc, id: string): Sel {
  return mainList($)
    .find('li')
    .filter((_, el) => $(el).attr(ID) === id)
    .first();
}

function readList($: Doc, list: Sel): TodoItem[] {
  return list
    .children('li')
    .toArray()
    .map((el) => {
      const li = $(el);
      const own = li.clone();
      own.children('ul, ol').remove();
      return {
        id: li.attr(ID) ?? '',
        text: own.text().trim(),
        done: checkbox(li).attr('checked') !== undefined,
        state: li.attr(STATE),
        children: readList($, li.children('ul.todo-list')),
      };
    });
}

export const parseTodos = (html: string): TodoItem[] => {
  const $ = load(html);
  return readList($, mainList($));
};

/** Give every managed item a unique ID. Returns the input unchanged if nothing is missing. */
export function ensureIds(html: string): string {
  const $ = load(html);
  const seen = new Set<string>();
  let changed = false;
  mainList($)
    .find('li')
    .each((_, el) => {
      const id = $(el).attr(ID);
      if (!id || seen.has(id)) {
        $(el).attr(ID, newItemId());
        changed = true;
      }
      seen.add($(el).attr(ID)!);
    });
  return changed ? $.html() : html;
}

/** Place an item after the last open sibling, or first if no sibling is open. */
function placeAtEndOfOpen($: Doc, list: Sel, li: Sel): void {
  li.remove();
  const open = list.children('li').filter((_, el) => checkbox($(el)).attr('checked') === undefined);
  if (open.length > 0) open.last().after(li);
  else list.prepend(li);
}

export function applyOps(html: string, ops: Op[]): { html: string; skipped: Op[] } {
  if (ops.length === 0) return { html, skipped: [] };
  const $ = load(html);
  const skipped: Op[] = [];
  let changed = false;

  for (const op of ops) {
    if (op.type === 'add') {
      if (findItem($, op.id).length > 0) continue; // already saved: safe to replay
      if (mainList($).length === 0) $.root().append('<ul class="todo-list"></ul>');
      const li = $(
        '<li><label class="todo-list__label"><input type="checkbox" disabled="disabled">' +
          '<span class="todo-list__label__description"></span></label></li>',
      );
      li.attr(ID, op.id);
      li.find('span').text(op.text); // .text() escapes markup
      placeAtEndOfOpen($, mainList($), li);
      changed = true;
      continue;
    }

    const li = findItem($, op.id);
    if (li.length === 0) {
      skipped.push(op);
      continue;
    }

    if (op.type === 'setDone') {
      const box = checkbox(li);
      if ((box.attr('checked') !== undefined) === op.done) continue;
      if (op.done) box.attr('checked', 'checked');
      else box.removeAttr('checked');
      if (li.attr(STATE) !== undefined) li.removeAttr(STATE).removeAttr('title');
      changed = true;
      continue;
    }

    const list = li.parent();
    const target = op.beforeId === null ? null : findItem($, op.beforeId);
    if (target && target.length > 0) {
      if (op.beforeId === op.id) continue;
      if (target.parent()[0] !== list[0]) {
        skipped.push(op);
        continue;
      }
      if (li.next('li')[0] === target[0]) continue;
      target.before(li);
    } else {
      placeAtEndOfOpen($, list, li);
    }
    changed = true;
  }

  return { html: changed ? $.html() : html, skipped };
}
