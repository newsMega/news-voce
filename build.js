const fs = require('fs');
const path = require('path');

// 🔥 IMPORTANTE: fetch compatível com Node
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// URL base dos arquivos fixos (AJUSTE se necessário)
const BASE_URL = 'https://raw.githubusercontent.com/newsMega/news-voce/main/assets/';

// =========================
// 🔹 FETCH
// =========================
async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Erro ao buscar ${url}: ${response.status}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Erro ao buscar ${url}: ${response.status}`);
  return response.text();
}

// =========================
// 🔹 HTML HELPERS
// =========================
function generateImageCell(item, link) {
  const imgTag = `<img width="110" height="110" alt="${item.tit || ''}" title="${item.tit || ''}"
    src="${item.img || ''}" 
    style="width:110px;height:110px;max-height:110px;max-width:110px;display:block;margin:auto;object-fit:cover;border:0;outline:none;text-decoration:none;"
  />`;

  let inner = imgTag;
  if (item.img_link === true && link && link !== 'false') {
    inner = `<a href="${link}" style="text-decoration:none;display:block">${imgTag}</a>`;
  }

  return `<td height="110px" valign="top" width="110px" align="left" style="padding:0;Margin:0">
  ${inner}
</td>`;
}

function renderItens(template, itens, colorConfig, ctas) {
  return itens.map(item => {
    let bloco = template;

    const imageCellRegex = /<td[^>]*>\s*<img[^>]*\/>\s*<\/td>/;
    const match = bloco.match(imageCellRegex);

    if (match) {
      bloco = bloco.replace(match[0], generateImageCell(item, item.link));
    }

    bloco = bloco.replace(/{item-img}/g, item.img || '');
    bloco = bloco.replace(/{item-tit}/g, item.tit || '');
    bloco = bloco.replace(/{item-txt}/g, item.txt || '');

    const ctaKey = (item.cta && item.cta !== 'false') ? item.cta : null;
    const hasValidCta = ctaKey && ctas[ctaKey];

    if (hasValidCta) {
      bloco = bloco.replace(/{item-link}/g, item.link || '#');
      bloco = bloco.replace(/{item-cta}/g, ctas[ctaKey]);
    } else {
      bloco = bloco.replace(/<!-- CTA:start -->([\s\S]*?)<!-- CTA:end -->/g, '');
    }

    bloco = bloco.replace(/{tema-tit-color}/g, colorConfig.titColor);
    bloco = bloco.replace(/{tema-txt-color}/g, colorConfig.txtColor);

    return bloco;
  }).join('');
}

function generateBannerBlock(banner) {
  if (!banner) return '';

  const { img, tit, link } = banner;
  const imgTag = `<img src="${img}" alt="${tit}" width="100%" style="display:block;border:0;width:100%;max-width:600px;" />`;

  if (link && link !== 'false') {
    return `<td align="center"><a href="${link}">${imgTag}</a></td>`;
  }

  return `<td align="center">${imgTag}</td>`;
}

// =========================
// 🔹 MAIN
// =========================
(async () => {
  try {
    const dataFilePath = process.argv[2] || './data.json';

    if (!fs.existsSync(dataFilePath)) {
      throw new Error(`Arquivo ${dataFilePath} não encontrado.`);
    }

    const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf-8'));

    if (!data.vigencia) {
      throw new Error('Campo "vigencia" obrigatório');
    }

    if (data.versao === undefined) {
      data.versao = 1;
    }

    // 🔥 fetch paralelo
    const [colors, ctas, editorias, htmlTemplate] = await Promise.all([
      fetchJSON(`${BASE_URL}colors.json`),
      fetchJSON(`${BASE_URL}ctas.json`),
      fetchJSON(`${BASE_URL}editorias.json`),
      fetchText(`${BASE_URL}template.html`)
    ]);

    let html = htmlTemplate;

    // Banner
    html = html.replace('{banner-block}', generateBannerBlock(data.banner));

    // Temas
    const temaRegex = /<!-- LOOP:temas:start -->([\s\S]*?)<!-- LOOP:temas:end -->/;
    const temaTemplate = html.match(temaRegex)?.[1];

    if (!temaTemplate) {
      throw new Error('LOOP de temas não encontrado');
    }

    const temasHtml = Object.entries(data)
      .filter(([key, tema]) => tema?.items && !['banner', 'vigencia', 'versao'].includes(key))
      .map(([temaKey, tema]) => {
        let bloco = temaTemplate;

        const color = colors[tema.color] || {};
        const aba = editorias[tema.aba] || '';

        bloco = bloco.replace(/{tema-nome}/g, temaKey);
        bloco = bloco.replace(/{tema-aba}/g, aba);
        bloco = bloco.replace(/{tema-bg}/g, color.bgColor || '#fff');

        const itensRegex = /<!-- LOOP:itens:start -->([\s\S]*?)<!-- LOOP:itens:end -->/;
        const itemTemplate = bloco.match(itensRegex)?.[1];

        if (!itemTemplate) return bloco;

        const itensHtml = renderItens(itemTemplate, tema.items, color, ctas);

        return bloco.replace(itensRegex, itensHtml);
      }).join('');

    html = html.replace(temaRegex, temasHtml);

    // Nome do arquivo (MANTIDO como você pediu)
    const fileName = `DPSP-NewsPraVoce-${data.vigencia}_v${data.versao}.html`;

    fs.writeFileSync(fileName, html);

    console.log(`✅ HTML gerado: ${fileName}`);

  } catch (err) {
    console.error('❌ ERRO NO BUILD:', err);
    process.exit(1);
  }
})();
