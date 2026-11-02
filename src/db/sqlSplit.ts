export interface SplitStatement {
  sql: string;
  index: number;
}

const DOLLAR_TAG = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;
const DELIMITER_DIRECTIVE = /^\s*DELIMITER\s+(\S+)\s*;?\s*$/i;

interface Segment {
  text: string;
  delimiter: string;
}

/**
 * 按 `DELIMITER` 指令把脚本切成若干段，每段有自己的语句终止符。
 * MySQL 客户端的 `DELIMITER $$` 用来包裹存储过程中的分号；这段指令本身不是 SQL。
 */
function splitByDelimiterDirective(input: string): Segment[] {
  const segments: Segment[] = [];
  const lines = input.split('\n');
  let delimiter = ';';
  let buffer: string[] = [];

  const push = (): void => {
    const text = buffer.join('\n');
    buffer = [];
    if (text.trim().length > 0) segments.push({ text, delimiter });
  };

  for (const line of lines) {
    const m = DELIMITER_DIRECTIVE.exec(line);
    if (m) {
      push();
      delimiter = m[1];
      continue;
    }
    buffer.push(line);
  }
  push();

  if (segments.length === 0) segments.push({ text: input, delimiter: ';' });
  return segments;
}

/**
 * 把脚本按顶层分号切成多条语句。
 *
 * 安全约定：**注释原样保留**在语句文本里。
 * 若把 `U/** PATCH` 之类的注释断字注释剥离后再送检，AST 解析器就会把它当成
 * 合法 UPDATE 放行，等于凭空造出绕过漏洞。保留注释后，解析器解析失败 →
 * 权限校验判定为 dangerous → 拒绝。
 *
 * 识别：单引号/双引号/反引号字符串（含反斜杠转义与 '' 双写）、
 *       -- 行注释、# 行注释（MySQL）、C 风格块注释、$$dollar$$（PostgreSQL）、
 *       MySQL 的 `DELIMITER` 指令。
 * 字符串里的分号不切分；纯注释片段不产生语句。
 */
export function splitSqlStatements(input: string): SplitStatement[] {
  const statements: SplitStatement[] = [];

  for (const segment of splitByDelimiterDirective(input)) {
    for (const stmt of splitSegment(segment.text, segment.delimiter)) {
      statements.push({ sql: stmt, index: statements.length + 1 });
    }
  }

  return statements;
}

function splitSegment(text: string, delimiter: string): string[] {
  const statements: string[] = [];
  const len = text.length;
  let buf = '';
  let hasCode = false;
  let i = 0;

  const flush = (): void => {
    const trimmed = buf.trim();
    const keep = hasCode && trimmed.length > 0;
    buf = '';
    hasCode = false;
    if (!keep) return;
    statements.push(trimmed);
  };

  while (i < len) {
    const ch = text[i];

    if (ch === '-' && text[i + 1] === '-' && (i + 2 >= len || /\s/.test(text[i + 2]))) {
      const nl = text.indexOf('\n', i);
      const end = nl === -1 ? len : nl;
      buf += text.slice(i, end);
      i = end;
      continue;
    }

    if (ch === '#') {
      const nl = text.indexOf('\n', i);
      const end = nl === -1 ? len : nl;
      buf += text.slice(i, end);
      i = end;
      continue;
    }

    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? len : end + 2;
      buf += text.slice(i, stop);
      i = stop;
      continue;
    }

    // 自定义终止符（DELIMITER $$ 场景）：必须早于 PostgreSQL 的 $$dollar$$ 判定
    if (delimiter !== ';' && text.startsWith(delimiter, i)) {
      flush();
      i += delimiter.length;
      continue;
    }

    if (ch === '$') {
      const m = DOLLAR_TAG.exec(text.slice(i));
      if (m) {
        const tag = m[0];
        const close = text.indexOf(tag, i + tag.length);
        const end = close === -1 ? len : close + tag.length;
        buf += text.slice(i, end);
        hasCode = true;
        i = end;
        continue;
      }
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      let segment = quote;
      while (j < len) {
        const c = text[j];
        if (c === '\\' && quote !== '`' && j + 1 < len) {
          segment += text.slice(j, j + 2);
          j += 2;
          continue;
        }
        if (c === quote) {
          if (text[j + 1] === quote) {
            segment += quote + quote;
            j += 2;
            continue;
          }
          segment += quote;
          j += 1;
          break;
        }
        segment += c;
        j += 1;
      }
      buf += segment;
      hasCode = true;
      i = j;
      continue;
    }

    if (ch === ';' && delimiter === ';') {
      flush();
      i += 1;
      continue;
    }

    if (!/\s/.test(ch)) hasCode = true;
    buf += ch;
    i += 1;
  }

  flush();
  return statements;
}
