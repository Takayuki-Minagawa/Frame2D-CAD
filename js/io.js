// io.js - JSON Export / Import

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
  const sections = state.sectionCatalog.filter(s => !s.isDefault).map(s => ({ ...s }));
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
        let count = 0;
        if (Array.isArray(data.sections)) {
          for (const entry of data.sections) {
            if (entry.isDefault) continue;
            const added = state.addSection(entry);
            if (added) count++;
          }
        }
        if (Array.isArray(data.springs)) {
          for (const entry of data.springs) {
            if (entry.isDefault) continue;
            const added = state.addSpring(entry);
            if (added) count++;
          }
        }
        resolve(count);
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

function pad(n) {
  return String(n).padStart(2, '0');
}
