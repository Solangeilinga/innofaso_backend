const { v4: uuid } = require('uuid');

const FIELD_TYPES = new Set([
  'text', 'number', 'date', 'select', 'checkbox', 'textarea',
  'currency', 'email', 'phone', 'file', 'time', 'signature'
]);

const TYPE_TO_EAV = {
  text: 'TEXTE',
  textarea: 'TEXTE',
  email: 'TEXTE',
  phone: 'TEXTE',
  file: 'PHOTO',
  number: 'NOMBRE',
  currency: 'NOMBRE',
  date: 'DATE',
  time: 'HEURE',
  checkbox: 'BOOLEEN',
  select: 'LISTE',
  signature: 'SIGNATURE',
};

const EAV_TO_TYPE = {
  TEXTE: 'text',
  NOMBRE: 'number',
  DATE: 'date',
  HEURE: 'time',
  BOOLEEN: 'checkbox',
  LISTE: 'select',
  SIGNATURE: 'signature',
  PHOTO: 'file',
};

const DEFAULT_COLORS = ['#2D6A4F', '#2563EB', '#B45309', '#7C3AED', '#0F766E'];

function slugify(value, fallback = 'champ') {
  const base = String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return base || `${fallback}_${Date.now()}`;
}

function uniqueName(label, used) {
  const base = slugify(label);
  let name = base;
  let i = 2;
  while (used.has(name)) {
    name = `${base}_${i}`;
    i += 1;
  }
  used.add(name);
  return name;
}

function normalizeField(field, usedNames = new Set(), index = 0) {
  const label = String(field.label || field.name || `Champ ${index + 1}`).trim();
  const type = FIELD_TYPES.has(field.type) ? field.type : 'text';
  const row = Number.isFinite(+field.position?.row) ? +field.position.row : index + 1;
  const column = Number.isFinite(+field.position?.column) ? +field.position.column : 1;
  const colSpan = Math.max(1, +(field.position?.colSpan || field.colSpan || 1));
  const name = field.name ? slugify(field.name) : uniqueName(label, usedNames);

  return {
    id: field.id || uuid(),
    legacyChampId: field.legacyChampId || null,
    name,
    label,
    type,
    required: !!field.required,
    options: Array.isArray(field.options) ? field.options.filter(Boolean) : [],
    validation: field.validation || {},
    position: { row, column, colSpan },
    style: {
      labelColor: field.style?.labelColor || '#374151',
      bold: !!field.style?.bold,
      backgroundColor: field.style?.backgroundColor || null,
    },
    metadata: field.metadata || {},
  };
}

function normalizeSchema(input = {}, fallback = {}) {
  const used = new Set();
  const fields = Array.isArray(input.fields)
    ? input.fields.map((field, index) => normalizeField(field, used, index))
    : [];

  const columns = Math.max(1, +(input.layout?.columns || fallback.columns || 2));
  const sections = Array.isArray(input.sections) && input.sections.length
    ? input.sections.map((section, index) => ({
        id: section.id || uuid(),
        title: String(section.title || `Section ${index + 1}`).trim(),
        color: section.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
        position: {
          rowStart: Math.max(1, +(section.position?.rowStart || 1)),
          rowEnd: Math.max(1, +(section.position?.rowEnd || section.position?.rowStart || 1)),
          colStart: Math.max(1, +(section.position?.colStart || 1)),
          colEnd: Math.max(1, +(section.position?.colEnd || columns)),
        },
        style: section.style || {},
      }))
    : [{
        id: uuid(),
        title: 'General',
        color: DEFAULT_COLORS[0],
        position: { rowStart: 1, rowEnd: Math.max(1, fields.length), colStart: 1, colEnd: columns },
        style: {},
      }];

  return {
    version: '1.0',
    title: input.title || fallback.title || 'Formulaire',
    description: input.description || '',
    layout: {
      columns,
      rowGap: input.layout?.rowGap || 16,
      columnGap: input.layout?.columnGap || 16,
    },
    sections,
    fields,
    source: input.source || fallback.source || { type: 'manual' },
    audit: {
      generatedAt: new Date().toISOString(),
      generator: input.audit?.generator || 'innofaso-schema-pivot',
    },
  };
}

function inferType(cell = {}) {
  if (FIELD_TYPES.has(cell.type)) return cell.type;
  const value = String(cell.value || '').toLowerCase();
  if (value.includes('date')) return 'date';
  if (value.includes('heure')) return 'time';
  if (value.includes('email')) return 'email';
  if (value.includes('tel') || value.includes('phone')) return 'phone';
  if (value.includes('montant') || value.includes('prix') || value.includes('cout') || value.includes('coût')) return 'currency';
  if (value.includes('oui/non') || value.includes('ok/nok')) return 'checkbox';
  if (Array.isArray(cell.options) && cell.options.length) return 'select';
  if (value.includes('observation') || value.includes('commentaire')) return 'textarea';
  if (value.includes('signature')) return 'signature';
  if (value.includes('photo') || value.includes('piece jointe') || value.includes('pièce jointe')) return 'file';
  if (value.includes('nombre') || value.includes('quantite') || value.includes('quantité')) return 'number';
  return 'text';
}

function spreadsheetToSchema(sheet, fallback = {}) {
  const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
  const columns = Math.max(1, +(sheet?.columns || fallback.columns || 2));
  const fields = [];
  const sections = [];
  const usedNames = new Set();
  let currentSection = null;
  let sectionIndex = 0;

  rows.forEach((row, rowIndex) => {
    const cells = Array.isArray(row.cells) ? row.cells : [];
    const nonEmpty = cells
      .map((cell, idx) => ({ ...cell, column: idx + 1 }))
      .filter(cell => String(cell.value || '').trim());

    if (!nonEmpty.length) return;

    const first = nonEmpty[0];
    const isSection = first.kind === 'section'
      || first.merged
      || (nonEmpty.length === 1 && !first.type && rowIndex === 0)
      || (nonEmpty.length === 1 && first.backgroundColor);

    if (isSection) {
      if (currentSection) currentSection.position.rowEnd = Math.max(currentSection.position.rowStart, rowIndex);
      currentSection = {
        id: uuid(),
        title: String(first.value).trim(),
        color: first.backgroundColor || DEFAULT_COLORS[sectionIndex % DEFAULT_COLORS.length],
        position: { rowStart: rowIndex + 1, rowEnd: rowIndex + 1, colStart: 1, colEnd: columns },
        style: { labelColor: first.textColor || '#ffffff', bold: true },
      };
      sections.push(currentSection);
      sectionIndex += 1;
      return;
    }

    nonEmpty.forEach(cell => {
      const label = String(cell.value).trim();
      fields.push(normalizeField({
        name: uniqueName(label, usedNames),
        label,
        type: inferType(cell),
        required: !!cell.required || label.endsWith('*'),
        options: Array.isArray(cell.options) ? cell.options : [],
        position: {
          row: rowIndex + 1,
          column: cell.column,
          colSpan: Math.max(1, +(cell.colSpan || 1)),
        },
        style: {
          labelColor: cell.textColor || '#374151',
          bold: !!cell.bold,
          backgroundColor: cell.backgroundColor || null,
        },
      }, usedNames, fields.length));
    });

    if (currentSection) currentSection.position.rowEnd = rowIndex + 1;
  });

  return normalizeSchema({
    title: fallback.title,
    layout: { columns },
    sections,
    fields,
    source: {
      type: 'embedded_spreadsheet',
      engine: sheet?.engine || 'innofaso-grid',
      capturedAt: new Date().toISOString(),
    },
  }, fallback);
}

function legacyChampsToSchema(formulaire, champs = []) {
  const sectionOrder = [];
  const sectionMap = new Map();
  const fields = champs.map((champ, index) => {
    const section = champ.section || 'General';
    if (!sectionMap.has(section)) {
      sectionOrder.push(section);
      sectionMap.set(section, {
        id: uuid(),
        title: section,
        color: DEFAULT_COLORS[sectionOrder.length % DEFAULT_COLORS.length],
        position: { rowStart: index + 1, rowEnd: index + 1, colStart: 1, colEnd: 2 },
        style: {},
      });
    }
    sectionMap.get(section).position.rowEnd = index + 1;
    return normalizeField({
      id: uuid(),
      legacyChampId: champ.id,
      name: slugify(champ.nom_champ),
      label: champ.nom_champ,
      type: EAV_TO_TYPE[champ.type_champ] || 'text',
      required: champ.obligatoire,
      options: Array.isArray(champ.options_liste) ? champ.options_liste : (champ.options_liste || []),
      position: { row: index + 1, column: (index % 2) + 1, colSpan: 1 },
    }, new Set(), index);
  });

  return normalizeSchema({
    title: formulaire.titre,
    layout: { columns: 2 },
    sections: Array.from(sectionMap.values()),
    fields,
    source: { type: 'legacy_champ_definition' },
  });
}

function schemaToChampDefinitions(schema) {
  const normalized = normalizeSchema(schema);
  return normalized.fields.map((field, index) => {
    const section = normalized.sections.find(sec =>
      field.position.row >= sec.position.rowStart && field.position.row <= sec.position.rowEnd
    );
    return {
      nom_champ: field.label,
      type_champ: TYPE_TO_EAV[field.type] || 'TEXTE',
      section: section?.title || 'General',
      obligatoire: field.required,
      ordre: index + 1,
      unite: field.type === 'currency' ? 'FCFA' : null,
      options_liste: field.type === 'select' ? field.options : null,
      schema_field_id: field.id,
    };
  });
}

module.exports = {
  normalizeSchema,
  spreadsheetToSchema,
  legacyChampsToSchema,
  schemaToChampDefinitions,
};
