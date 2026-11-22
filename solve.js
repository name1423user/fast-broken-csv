// 仮の solve.js（M1-T02）。答えの形だけを返す。読み込み処理は M2-T02 で書く。

/** @param {{text: string, header: boolean}} input */
export function run(input) {
  return { columns: input.header ? [] : null, rows: [], errors: [] };
}
