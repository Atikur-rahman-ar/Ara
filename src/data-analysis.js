import { parse } from "csv-parse/sync";

function numericValues(values) {
  return values
    .map((value) => String(value ?? "").trim())
    .filter((value) => value !== "")
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const x = a.slice(0, n);
  const y = b.slice(0, n);
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  const numerator = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0);
  const dx = Math.sqrt(x.reduce((s, v) => s + (v - mx) ** 2, 0));
  const dy = Math.sqrt(y.reduce((s, v) => s + (v - my) ** 2, 0));
  return dx && dy ? Number((numerator / (dx * dy)).toFixed(4)) : null;
}

export function analyzeCsv(buffer, filename = "dataset.csv") {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error("The CSV file is empty.");
  const raw = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
    to: 5001
  });
  if (!rows.length) throw new Error("No data rows were found in the CSV.");
  const headers = Object.keys(rows[0] || {});
  if (!headers.length) throw new Error("The CSV has no header row.");
  if (headers.length > 60) throw new Error("The current limit is 60 columns per CSV.");

  const columns = headers.map((name) => {
    const values = rows.map((row) => row[name] ?? "");
    const present = values.filter((value) => String(value).trim() !== "");
    const numeric = numericValues(present);
    const isNumeric = present.length > 0 && numeric.length / present.length >= 0.85;
    if (isNumeric) {
      const mean = numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
      const variance = numeric.reduce((sum, value) => sum + (value - mean) ** 2, 0) / numeric.length;
      return {
        name,
        type: "numeric",
        count: numeric.length,
        missing: rows.length - present.length,
        min: Math.min(...numeric),
        max: Math.max(...numeric),
        mean: Number(mean.toFixed(5)),
        median: Number(median(numeric).toFixed(5)),
        standardDeviation: Number(Math.sqrt(variance).toFixed(5))
      };
    }
    const counts = new Map();
    for (const value of present) counts.set(String(value), (counts.get(String(value)) || 0) + 1);
    return {
      name,
      type: "categorical/text",
      count: present.length,
      missing: rows.length - present.length,
      unique: counts.size,
      topValues: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([value, count]) => ({ value, count }))
    };
  });

  const numericColumns = columns.filter((column) => column.type === "numeric").slice(0, 12);
  const correlations = [];
  for (let i = 0; i < numericColumns.length; i += 1) {
    for (let j = i + 1; j < numericColumns.length; j += 1) {
      const a = rows.map((row) => Number(row[numericColumns[i].name])).filter(Number.isFinite);
      const b = rows.map((row) => Number(row[numericColumns[j].name])).filter(Number.isFinite);
      const value = pearson(a, b);
      if (value !== null) correlations.push({ x: numericColumns[i].name, y: numericColumns[j].name, pearson: value });
    }
  }

  return {
    filename: String(filename).slice(0, 180),
    rows: rows.length,
    columns: headers.length,
    truncated: rows.length >= 5001,
    columnSummary: columns,
    correlations: correlations.sort((a, b) => Math.abs(b.pearson) - Math.abs(a.pearson)).slice(0, 20),
    preview: rows.slice(0, 8)
  };
}
