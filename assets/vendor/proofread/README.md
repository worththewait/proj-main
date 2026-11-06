# 纠错校对的本地 Office 解析库

这些脚本按文件格式首次使用时加载。页面支持直接打开本地 HTML，文档正文在浏览器内提取。

- `xlsx.full.min.js` 来自 [SheetJS 0.20.3 官方发布包](https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz)，用于 Excel 和 Word 容器读取。
- `mammoth.browser.min.js` 来自 [Mammoth 1.11.0](https://www.npmjs.com/package/mammoth/v/1.11.0)，用于提取 DOCX 正文。
- `legacy-word.js` 基于 [Word Extractor 1.0.4](https://www.npmjs.com/package/word-extractor/v/1.0.4) 和 [Buffer 6.0.3](https://www.npmjs.com/package/buffer/v/6.0.3)，使用 SheetJS 读取 DOC 的 OLE 数据流。

更新 DOC 解析包时，将 `legacy-word-src` 中的三个文件复制到一个独立目录，在该目录安装固定版本的构建依赖并执行以下命令，然后复制生成的 `legacy-word.js` 到这里。

```sh
npm install --save-exact esbuild@0.25.12 word-extractor@1.0.4 buffer@6.0.3
npx esbuild legacy-word-entry.cjs --bundle --minify --platform=browser \
  --format=iife --global-name=BaigeLegacyWord --inject:./legacy-word-buffer.mjs \
  --alias:stream=./legacy-word-unused-stream.cjs --outfile=legacy-word.js
```
