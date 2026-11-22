// 一致テストの固定ケース。fuzz.mjs（solve.js）と fuzz-main.mjs（main.ts）が使う。

// AC-003 の境界ケース。header の true / false 両方で試す。
export const FIXED = [
  '', '﻿', '﻿﻿', '\n', '\n\n\n', '\r\n', '\r\n\r\n', '\r', '\r\r\n', 'a', 'a\n', 'a\r\n', 'a\r', 'a\rb\n',
  'a,b\nc,d', 'a,b\r\nc,d', 'a,b\n1,2\n', 'a\nb\nc\n', 'a,b,c\n1\n1,2,3,4,5\n', ',\n,,\n', '"', '""', '"""', 'a"', 'a,"',
  'a,b\n1,"', '"a""b",c\n', '"a\nb",c\n"d\r\ne",f\n"g\rh",i\n', '"a"x,b\n', '"a"x"y,b\n', '"a" ,b\n', 'a"b,c\n',
  'a,b\n"open,c\nd,e\n', 'a,b\nc,"open', 'a,b\nc,d\n"x', '﻿a,b\n1,2', 'a,b\n\n1,2\n\r\n3,4', 'h1,h2\n', 'h1,h2',
  'a,b\n1,2\rx,3\n', 'x,"y\r', ' a , b \n', '東京,"數據"\nΔέλτα,Москва\n',
  // CR と引用符が隣り合う形（M2-T02 の報告から）
  '"a"\r', '"a"\r\r\n', '\r"a"', '"\r', ',"\r', '"\r\n"', '"a"\n\r\n\r', '"abc""', 'a,"b,""\n', '\r\r\na,b\n', '"a"x\ry,b\n',
  // 閉じない引用符の後ろでも、引用符つきフィールドは閉じうる。\ と制御文字のエスケープ（main.ts の変換器向け）
  '"x,""y', 'a,"b,""c,"d', 'a,"b\n"c""d,"e\n', 'a\\b,"c\\"\n', 'x\ty\u0001,"\b\f\u001f"\n',
].flatMap((text) => [true, false].map((header) => ({ text, header })))
  // header はちょうど true のときだけヘッダーあり（BASELINE_NOTES B-01）
  .concat([{ text: 'a\nb', header: 1 }, { text: 'a\nb', header: 'true' }]);
