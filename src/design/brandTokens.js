// ─────────────────────────────────────────────────────────────────────────────
// Samper Consulting brand tokens for EXPORTS (generated PDFs, printable views,
// export previews).
//
// This is the only place an export may take a colour, a family or a type size
// from. Nothing warm survives here: no gold, no beige, no cream, no warm grey.
// Screen UI keeps its own CSS custom properties (var(--accent), var(--surface)
// and friends) and is out of this file's scope: the two systems meet only in
// `THEME_VAR_OVERRIDES`, which resolves the screen tokens to brand hex when a
// live component is captured for print.
// ─────────────────────────────────────────────────────────────────────────────

export const BRAND = {
  color: {
    primary:    '#003042',  // brand blue: titles, table headers, strong rules
    accent:     '#4F818F',  // side bars, accent rules
    tint:       '#E9F0F3',  // total rows and highlighted blocks
    zebra:      '#F4F8F9',  // alternating rows
    rule:       '#CFDBE0',  // outline rules
    ruleLight:  '#E2EAEE',  // inner rules
    ink:        '#26313A',  // body text
    stone:      '#5A6C75',  // notes, secondary mentions
    white:      '#FFFFFF',
  },
  font: {
    serif:       'Lora',          // voice: titles, block titles, amounts
    serifItalic: 'LoraItalic',    // italic notes
    label:       'PoppinsMedium', // letterspaced caps labels
    body:        'PoppinsLight',  // body copy and cells
  },
  size: {
    title: 14.5, sectionLabel: 7.2, blockTitle: 9.2,
    body: 8, cell: 7.2, amount: 8, amountLarge: 11, note: 7,
  },
  charSpace: { sectionLabel: 1.3, label: 0.9, title: 0.9 },
  page: { marginMm: 18 },
};

// Status colours. A compliance register has to say "out of range" in a way a
// health inspector reads at a glance, so these two survive as the single
// non-brand hues of the system. They are desaturated towards the brand blue so
// they sit in the palette rather than shout over it.
export const BRAND_STATUS = {
  ok: '#2F6B4F',
  alert: '#A8322D',
};

// Direct-thermal media (the DK-11209 label roll) has neither colour nor grey:
// the print head either burns a dot or does not. Brand blue would come out as a
// muddy dither and a cold-room label would lose the contrast it exists for, so
// labels print in solid ink and take their identity from the typography alone.
export const THERMAL = { ink: '#000000' };

// jsPDF wants colour components, not strings.
export const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

// Same tokens, pre-split for jsPDF calls: doc.setTextColor(...PDF.primary).
export const PDF = {
  primary:   rgb(BRAND.color.primary),
  accent:    rgb(BRAND.color.accent),
  tint:      rgb(BRAND.color.tint),
  zebra:     rgb(BRAND.color.zebra),
  rule:      rgb(BRAND.color.rule),
  ruleLight: rgb(BRAND.color.ruleLight),
  ink:       rgb(BRAND.color.ink),
  stone:     rgb(BRAND.color.stone),
  white:     rgb(BRAND.color.white),
  ok:        rgb(BRAND_STATUS.ok),
  alert:     rgb(BRAND_STATUS.alert),
  thermalInk: rgb(THERMAL.ink),
};

// Rule weights, in millimetres of line width. Named rather than repeated so a
// document never invents its own hierarchy of strokes.
export const RULE = {
  strong: 0.56,   // 1.6 pt: under the document title
  accentBar: 0.78, // 2.2 pt: identity block side bar
  medium: 0.3,
  hair: 0.15,
};

// ─── Screen tokens resolved to brand hex for capture and print ──────────────
// html2canvas cannot parse oklch() and the print window inherits nothing from
// the app document, so every CSS custom property a captured component may use
// is redeclared here in hex. Values are the brand palette, not the screen
// palette: a captured view must come out looking like a brand document.
export const THEME_VAR_OVERRIDES = `
  .pdf-render-root, .pdf-render-root * {
    --bg: ${BRAND.color.white};
    --bg2: ${BRAND.color.zebra};
    --surface: ${BRAND.color.white};
    --surface2: ${BRAND.color.zebra};
    --border: ${BRAND.color.rule};
    --border2: ${BRAND.color.ruleLight};
    --text: ${BRAND.color.ink};
    --text2: ${BRAND.color.stone};
    --text3: ${BRAND.color.stone};
    --accent: ${BRAND.color.primary};
    --accent2: ${BRAND.color.accent};
    --accent-light: ${BRAND.color.tint};
    --accent-bd: ${BRAND.color.rule};
    --nav: ${BRAND.color.primary};
    --nav-text: ${BRAND.color.white};
    --nav-active: ${BRAND.color.tint};
    --nav-border: ${BRAND.color.ruleLight};
    --nav-grad: ${BRAND.color.primary};
    --nav-text-active: ${BRAND.color.white};
    --nav-accent: ${BRAND.color.accent};
    --nav-glow: none;
    --sh-xs: none;
    --sh-sm: none;
    --sh: none;
    --sh-lg: none;
    --glow-accent: none;
    --glow-soft: none;
    --focus-ring: transparent;
    --grad-brand: ${BRAND.color.primary};
    --grad-scrim: rgba(0, 22, 32, 0.55);
    --grad-accent-wash: ${BRAND.color.tint};
    --ambient: none;
    --success-bg: ${BRAND.color.tint};
    --success-bg-soft: ${BRAND.color.zebra};
    --success-text: ${BRAND_STATUS.ok};
    --success-bd: ${BRAND.color.rule};
    --success-strong: ${BRAND_STATUS.ok};
    --danger-bg: ${BRAND.color.tint};
    --danger-bg-soft: ${BRAND.color.zebra};
    --danger-text: ${BRAND_STATUS.alert};
    --danger-bd: ${BRAND.color.rule};
    --danger-strong: ${BRAND_STATUS.alert};
    --warning-bg: ${BRAND.color.tint};
    --warning-bg-soft: ${BRAND.color.zebra};
    --warning-text: ${BRAND.color.stone};
    --warning-bd: ${BRAND.color.rule};
    --warning-strong: ${BRAND.color.stone};
    --info-bg: ${BRAND.color.tint};
    --info-bg-soft: ${BRAND.color.zebra};
    --info-text: ${BRAND.color.primary};
    --info-bd: ${BRAND.color.rule};
    --info-strong: ${BRAND.color.accent};
  }
`;

// @font-face block for the print window and any captured DOM. Same four static
// instances jsPDF embeds, so an on-screen preview and the produced file share
// one typography. Paths are absolute: the print window is a blank document with
// no base URL of its own.
export const PRINT_FONT_FACES = `
  @font-face { font-family: 'Lora'; src: url('/fonts/Lora-Regular.ttf') format('truetype'); font-weight: 400; font-style: normal; font-display: block; }
  @font-face { font-family: 'Lora'; src: url('/fonts/Lora-Italic.ttf') format('truetype'); font-weight: 400; font-style: italic; font-display: block; }
  @font-face { font-family: 'Poppins'; src: url('/fonts/Poppins-Light.ttf') format('truetype'); font-weight: 300; font-style: normal; font-display: block; }
  @font-face { font-family: 'Poppins'; src: url('/fonts/Poppins-Medium.ttf') format('truetype'); font-weight: 500; font-style: normal; font-display: block; }
`;

// Stylesheet for the browser's own print dialog (Ctrl+P on the app), as opposed
// to the export buttons, which go through pdfUtils and its dedicated sheet.
// Built from the tokens rather than written into app.css, so this file stays
// the only place a colour or a family is declared for a printed page.
// Installed once at boot by installBrandPrintStyles().
export const BROWSER_PRINT_CSS = `
  @media print {
    @page { size: A4 portrait; margin: ${BRAND.page.marginMm}mm; }
    html, body {
      background: ${BRAND.color.white};
      color: ${BRAND.color.ink};
      font-family: 'Poppins', sans-serif;
      font-weight: 300;
    }
    /* Aucun gras : la hiérarchie passe par le corps, la couleur et la famille.
       Ni ombre ni dégradé, qui ne survivent pas au papier. */
    body * {
      font-weight: 300 !important;
      box-shadow: none !important;
      text-shadow: none !important;
      background-image: none !important;
    }
    h1, h2, h3 { font-family: 'Lora', serif; color: ${BRAND.color.primary}; }
    th {
      background: ${BRAND.color.primary} !important;
      color: ${BRAND.color.white} !important;
      font-family: 'Poppins', sans-serif;
      font-weight: 500 !important;
      text-transform: uppercase;
      letter-spacing: 0.13em;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    td { border-bottom: 0.5pt solid ${BRAND.color.ruleLight}; }
  }
`;

// CSS families for web-side export markup. No system face is ever named: the
// stacks end on a generic category keyword only, so a browser that failed to
// fetch the file still lands in the right register instead of on a face
// somebody chose.
export const WEB_FONT = {
  serif: "'Lora', serif",
  body: "'Poppins', sans-serif",
};

// The three typographic levels, as ready-made CSS fragments. A printable view
// composes these instead of restating a family, a weight and a letterspacing.
export const WEB_TYPE = {
  // Voice: document title, block titles, amounts.
  voice: { fontFamily: WEB_FONT.serif, fontWeight: 400 },
  voiceItalic: { fontFamily: WEB_FONT.serif, fontWeight: 400, fontStyle: 'italic' },
  // Label: section titles, table headers, row labels.
  label: { fontFamily: WEB_FONT.body, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.09em' },
  // Data: body copy, cells, lists.
  data: { fontFamily: WEB_FONT.body, fontWeight: 300 },
};
