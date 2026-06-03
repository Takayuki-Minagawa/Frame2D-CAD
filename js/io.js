// io.js - JSON/CSV Export / Import

import {
  computeMemberLengthM,
  computeQuantitySummary,
  computeSurfaceSeismicWeightN,
  computeSurfaceWeightAreaM2,
  computeSurfaceWindProjectionM2,
} from './quantities.js';

export function exportJSON(state) {
  const data = state.toJSON();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.meta.name || 'lineframe'}_${timestamp()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildQuantitySummaryCSV(state) {
  const summary = computeQuantitySummary(state);
  const rows = [
    ['section', 'name', 'wind_x_area_m2', 'wind_y_area_m2', 'seismic_weight_N', 'member_count', 'member_length_m'],
  ];
  for (const row of summary.levels) {
    rows.push([
      'level',
      row.label,
      formatCsvNumber(row.windXAreaM2),
      formatCsvNumber(row.windYAreaM2),
      formatCsvNumber(row.seismicWeightN),
      '',
      '',
    ]);
  }
  rows.push([
    'total',
    'total',
    formatCsvNumber(summary.totals.windXAreaM2),
    formatCsvNumber(summary.totals.windYAreaM2),
    formatCsvNumber(summary.totals.seismicWeightN),
    '',
    '',
  ]);
  for (const row of summary.roofMembers.rows) {
    rows.push([
      'roof_member',
      row.roofRole,
      '',
      '',
      '',
      String(row.count),
      formatCsvNumber(row.lengthM),
    ]);
  }
  rows.push([
    'roof_member_total',
    'total',
    '',
    '',
    '',
    String(summary.roofMembers.totals.count),
    formatCsvNumber(summary.roofMembers.totals.lengthM),
  ]);
  return `${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function exportQuantitySummaryCSV(state) {
  const csv = buildQuantitySummaryCSV(state);
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const name = state.meta?.name || 'lineframe';

  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}_quantities_${timestamp()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildQuantityDetailCSV(state) {
  const rows = [
    [
      'section',
      'id',
      'type',
      'level',
      'include_wind',
      'include_seismic_weight',
      'unit_weight',
      'wind_x_area_m2',
      'wind_y_area_m2',
      'weight_area_m2',
      'seismic_weight_N',
      'roof_role',
      'member_length_m',
    ],
  ];
  for (const surface of state.surfaces || []) {
    const wind = surface.includeWind !== false
      ? computeSurfaceWindProjectionM2(state, surface)
      : { xAreaM2: 0, yAreaM2: 0 };
    const weightArea = computeSurfaceWeightAreaM2(state, surface);
    const seismicWeight = surface.includeSeismicWeight
      ? computeSurfaceSeismicWeightN(state, surface)
      : 0;
    rows.push([
      'surface',
      surface.id || '',
      surface.type || '',
      surface.levelId || '',
      surface.includeWind !== false ? 'true' : 'false',
      surface.includeSeismicWeight ? 'true' : 'false',
      formatCsvNumber(surface.unitWeight),
      formatCsvNumber(wind.xAreaM2),
      formatCsvNumber(wind.yAreaM2),
      formatCsvNumber(weightArea),
      formatCsvNumber(seismicWeight),
      '',
      '',
    ]);
  }
  for (const member of state.members || []) {
    if (!member.roofRole) continue;
    rows.push([
      'roof_member',
      member.id || '',
      member.type || '',
      member.levelId || '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      member.roofRole,
      formatCsvNumber(computeMemberLengthM(state, member)),
    ]);
  }
  return `${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function exportQuantityDetailCSV(state) {
  const csv = buildQuantityDetailCSV(state);
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const name = state.meta?.name || 'lineframe';

  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}_quantity_details_${timestamp()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importJSON(file, state, history) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        history.save();
        state.loadJSON(data);
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function exportUserDefs(state) {
  const sections = state.sectionCatalog.filter(s => !s.isDefault).map(s => cloneSectionDefinition(s));
  const springs = state.springCatalog.filter(s => !s.isDefault).map(s => ({ ...s }));
  if (sections.length === 0 && springs.length === 0) return false;

  const data = { userDefinitions: true, sections, springs };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `user_definitions_${timestamp()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

function cloneSectionDefinition(section) {
  return {
    ...section,
    defaultEndI: section.defaultEndI ? { ...section.defaultEndI } : undefined,
    defaultEndJ: section.defaultEndJ ? { ...section.defaultEndJ } : undefined,
  };
}

export function importUserDefs(file, state) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.userDefinitions) {
          reject(new Error('Not a user definition file'));
          return;
        }
        let added = 0;
        let skipped = 0;
        if (Array.isArray(data.springs)) {
          for (const entry of data.springs) {
            if (entry.isDefault) continue;
            const result = state.addSpring(entry);
            if (result) { added++; } else { skipped++; }
          }
        }
        if (Array.isArray(data.sections)) {
          for (const entry of data.sections) {
            if (entry.isDefault) continue;
            const result = state.addSection(entry);
            if (result) { added++; } else { skipped++; }
          }
        }
        resolve({ added, skipped });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function csvCell(value) {
  const text = String(value ?? '');
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function formatCsvNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return String(Number(n.toFixed(6)));
}

function pad(n) {
  return String(n).padStart(2, '0');
}
