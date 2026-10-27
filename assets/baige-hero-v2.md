# 首页船舶知识主视觉

- 输出文件：`baige-hero-v2.png`
- 实际规格：1504 × 1046，RGBA 透明背景。
- 来源：2026-10-23 使用内置 ImageGen 根据已确认视觉方案生成；未从参考网站复制素材。
- 用途：`pages/home.html` 右侧装饰图。船舶为主体，知识文档和研究图表为辅助。CSS 使用 `object-fit: contain`，不可拉伸或裁掉主体。
- 参考页面仅用于配色与层次方向，保持百舸自己的船舶行业语义。

## 完整生成提示词

```text
Use case: stylized-concept. Asset type: transparent 3D illustration for the right side of the Baige ship-industry knowledge and AI services homepage. Create one polished isometric product illustration: a streamlined white and cobalt-blue research vessel, with two elegant layered knowledge/document panels rising behind it and a small cyan research chart panel. A single coherent composition, not a collage. Materials: satin white ceramic and clear blue acrylic, crisp refined geometry, subtle violet accents, cyan edge details, realistic soft studio lighting and restrained contact shadows attached to the objects. Palette: cobalt #245BFF dominant, blue-violet #6D5EF7 and teal #16A6B6 accents, neutral white. Ship must be clearly recognizable and visually dominant, the knowledge panels secondary. Premium enterprise cloud-platform aesthetic, precise and professional, inviting and vivid. Isometric three-quarter view; all objects fully in frame with generous 8% padding. Actual transparent background, no background plane, no rectangular backdrop. No words, no letters, no numbers, no logos, no watermark. No decorative orbits, no neon glow, no confetti, no people. Designed to remain legible when displayed about 420px wide by 260px tall.
```

生成参数：`transparent_background: true`；原始输出直接复制入项目，未做像素编辑。
