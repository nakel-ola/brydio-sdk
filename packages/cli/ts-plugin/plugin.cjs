// Built by scripts/build-ts-plugin.ts from src/ts-plugin.ts. Don't edit by hand.
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// src/ts-plugin.ts
var exports_ts_plugin = {};
__export(exports_ts_plugin, {
  default: () => ts_plugin_default,
  brydioDiagnostics: () => brydioDiagnostics,
  PLUGIN_SOURCE: () => PLUGIN_SOURCE,
  PLUGIN_CODE: () => PLUGIN_CODE
});
module.exports = __toCommonJS(exports_ts_plugin);
var import_node_fs = require("node:fs");
var import_node_path2 = require("node:path");

// ../ui/src/catalogue.ts
var LABEL_MAX = 200;
var PARAGRAPH_MAX = 4000;
var GAPS = ["1", "2", "3", "4", "5", "6", "7", "8"];
var PADDINGS = ["2", "3", "4", "5", "6"];
var TONES = ["neutral", "brand", "success", "warn", "danger"];
var SIZES = ["sm", "md", "lg"];
var INPUT_MAX = 1000;
var SELECT_MAX = 100;
var TABLE_COLUMNS = 12;
var TABLE_ROWS = 500;
var KEY_MAX = 128;
var VIRTUAL_ROWS = 1e6;
var DIALOG_ACTIONS = 3;
var MENU_ITEMS = 20;
var MENU_ICONS = [
  "add",
  "archive",
  "calendar",
  "check",
  "copy",
  "dismiss",
  "docs",
  "info",
  "mail",
  "members",
  "notes",
  "pin",
  "rename",
  "retry",
  "search",
  "settings",
  "tasks",
  "trash"
];
var BUTTON_ICONS = [...MENU_ICONS, "more", "close", "arrowRight", "chevronRight", "chevronDown", "chevronUp"];
var BOARD_CARDS = 1e5;
var MARKDOWN_MAX = 50000;
var DIFF_FILES = 300;
var DIFF_PATH = 1000;
var DIFF_PATCH = 200000;
var FILE_GRID_COUNT = 1e5;
var FILE_GRID_WINDOW = 200;
var FILE_KINDS = ["document", "spreadsheet", "presentation", "pdf", "image", "video", "audio", "code", "archive", "folder", "other"];
var ISO_DATE = 10;
var CATALOGUE = {
  "bry-stack": {
    props: {
      direction: { kind: "enum", values: ["row", "column"] },
      gap: { kind: "enum", values: GAPS },
      align: { kind: "enum", values: ["start", "center", "end", "stretch"] },
      justify: { kind: "enum", values: ["start", "center", "end", "between"] },
      wrap: { kind: "boolean" }
    },
    events: [],
    children: true
  },
  "bry-heading": {
    props: {
      level: { kind: "int", min: 1, max: 4 },
      text: { kind: "text", max: LABEL_MAX },
      variant: { kind: "enum", values: ["title", "heading", "subheading", "label"] }
    },
    required: ["text"],
    events: [],
    children: false
  },
  "bry-text": {
    props: {
      text: { kind: "text", max: PARAGRAPH_MAX },
      tone: { kind: "enum", values: ["default", "muted", ...TONES] },
      variant: { kind: "enum", values: ["body", "ui", "caption", "label"] },
      size: { kind: "enum", values: ["sm", "md"] }
    },
    required: ["text"],
    events: [],
    children: false
  },
  "bry-button": {
    props: {
      label: { kind: "text", max: LABEL_MAX },
      variant: { kind: "enum", values: ["primary", "secondary", "ghost", "danger"] },
      size: { kind: "enum", values: ["sm", "md"] },
      disabled: { kind: "boolean" },
      working: { kind: "boolean" },
      icon: { kind: "enum", values: BUTTON_ICONS },
      hideLabel: { kind: "boolean" }
    },
    required: ["label"],
    events: ["press"],
    children: false
  },
  "bry-card": {
    props: {
      title: { kind: "text", max: LABEL_MAX },
      padding: { kind: "enum", values: PADDINGS },
      pressable: { kind: "boolean" },
      loading: { kind: "boolean" }
    },
    events: ["press"],
    children: true
  },
  "bry-input": {
    props: {
      value: { kind: "text", max: INPUT_MAX },
      placeholder: { kind: "text", max: LABEL_MAX },
      label: { kind: "text", max: LABEL_MAX },
      kind: { kind: "enum", values: ["text", "email", "url", "search"] },
      maxLength: { kind: "int", min: 1, max: INPUT_MAX },
      required: { kind: "boolean" },
      disabled: { kind: "boolean" },
      error: { kind: "text", max: LABEL_MAX }
    },
    events: ["change", "submit"],
    children: false
  },
  "bry-textarea": {
    props: {
      value: { kind: "text", max: PARAGRAPH_MAX },
      placeholder: { kind: "text", max: LABEL_MAX },
      label: { kind: "text", max: LABEL_MAX },
      maxLength: { kind: "int", min: 1, max: PARAGRAPH_MAX },
      required: { kind: "boolean" },
      disabled: { kind: "boolean" },
      error: { kind: "text", max: LABEL_MAX }
    },
    events: ["change"],
    children: false
  },
  "bry-select": {
    props: {
      value: { kind: "text", max: LABEL_MAX },
      options: { kind: "options", max: SELECT_MAX },
      placeholder: { kind: "text", max: LABEL_MAX },
      label: { kind: "text", max: LABEL_MAX },
      size: { kind: "enum", values: ["sm", "md"] },
      disabled: { kind: "boolean" },
      error: { kind: "text", max: LABEL_MAX }
    },
    required: ["options"],
    events: ["change"],
    children: false
  },
  "bry-label": {
    props: {
      text: { kind: "text", max: LABEL_MAX },
      required: { kind: "boolean" }
    },
    required: ["text"],
    events: [],
    children: true
  },
  "bry-grid": {
    props: {
      columns: { kind: "enum", values: ["1", "2", "3", "4", "5", "6"] },
      gap: { kind: "enum", values: GAPS },
      align: { kind: "enum", values: ["start", "center", "end", "stretch"] }
    },
    events: [],
    children: true
  },
  "bry-badge": {
    props: {
      text: { kind: "text", max: LABEL_MAX },
      tone: { kind: "enum", values: TONES }
    },
    required: ["text"],
    events: [],
    children: false
  },
  "bry-avatar": {
    props: {
      name: { kind: "text", max: LABEL_MAX },
      size: { kind: "enum", values: SIZES }
    },
    required: ["name"],
    events: [],
    children: false
  },
  "bry-list-row": {
    props: {
      title: { kind: "text", max: LABEL_MAX },
      description: { kind: "text", max: LABEL_MAX },
      meta: { kind: "text", max: LABEL_MAX },
      pressable: { kind: "boolean" },
      selected: { kind: "boolean" },
      loading: { kind: "boolean" }
    },
    events: ["press"],
    children: true
  },
  "bry-empty-state": {
    props: {
      title: { kind: "text", max: LABEL_MAX },
      text: { kind: "text", max: PARAGRAPH_MAX },
      action: { kind: "text", max: LABEL_MAX }
    },
    required: ["title"],
    events: ["action"],
    children: false
  },
  "bry-skeleton": {
    props: {
      shape: { kind: "enum", values: ["line", "block", "row"] },
      count: { kind: "int", min: 1, max: 12 }
    },
    events: [],
    children: false
  },
  "bry-table": {
    props: {
      columns: {
        kind: "list",
        max: TABLE_COLUMNS,
        of: {
          kind: "shape",
          fields: {
            key: { kind: "text", max: KEY_MAX },
            heading: { kind: "text", max: LABEL_MAX },
            align: { kind: "enum", values: ["start", "end"] },
            sortable: { kind: "boolean" }
          },
          required: ["key", "heading"]
        }
      },
      rows: {
        kind: "list",
        max: TABLE_ROWS,
        of: {
          kind: "shape",
          fields: {
            id: { kind: "text", max: KEY_MAX },
            cells: { kind: "list", max: TABLE_COLUMNS, of: { kind: "text", max: LABEL_MAX } }
          },
          required: ["id", "cells"]
        }
      },
      sort: {
        kind: "shape",
        fields: { key: { kind: "text", max: KEY_MAX }, direction: { kind: "enum", values: ["asc", "desc"] } },
        required: ["key", "direction"]
      },
      label: { kind: "text", max: LABEL_MAX },
      selectable: { kind: "boolean" },
      selected: { kind: "text", max: KEY_MAX },
      loading: { kind: "boolean" },
      empty: { kind: "text", max: LABEL_MAX }
    },
    required: ["columns"],
    events: ["sort", "select"],
    children: false
  },
  "bry-virtual-list": {
    props: {
      count: { kind: "int", min: 0, max: VIRTUAL_ROWS },
      start: { kind: "int", min: 0, max: VIRTUAL_ROWS },
      rowSize: { kind: "enum", values: ["sm", "md", "lg"] },
      label: { kind: "text", max: LABEL_MAX },
      selectable: { kind: "boolean" },
      selected: { kind: "int", min: 0, max: VIRTUAL_ROWS },
      loading: { kind: "boolean" },
      empty: { kind: "text", max: LABEL_MAX }
    },
    required: ["count"],
    events: ["range", "select"],
    children: true
  },
  "bry-dialog": {
    props: {
      open: { kind: "boolean" },
      title: { kind: "text", max: LABEL_MAX },
      description: { kind: "text", max: PARAGRAPH_MAX },
      actions: {
        kind: "list",
        max: DIALOG_ACTIONS,
        of: {
          kind: "shape",
          fields: {
            id: { kind: "text", max: KEY_MAX },
            label: { kind: "text", max: LABEL_MAX },
            tone: { kind: "enum", values: ["default", "primary", "danger"] },
            disabled: { kind: "boolean" }
          },
          required: ["id", "label"]
        }
      },
      cancel: { kind: "text", max: LABEL_MAX }
    },
    required: ["title"],
    events: ["action", "close"],
    children: true
  },
  "bry-menu": {
    props: {
      items: {
        kind: "list",
        max: MENU_ITEMS,
        of: {
          kind: "shape",
          fields: {
            id: { kind: "text", max: KEY_MAX },
            label: { kind: "text", max: LABEL_MAX },
            icon: { kind: "enum", values: MENU_ICONS },
            tone: { kind: "enum", values: ["default", "danger"] },
            separator: { kind: "boolean" },
            disabled: { kind: "boolean" }
          },
          required: ["id", "label"]
        }
      }
    },
    required: ["items"],
    events: ["select"],
    children: true
  },
  "bry-date": {
    props: {
      value: { kind: "text", max: ISO_DATE },
      min: { kind: "text", max: ISO_DATE },
      max: { kind: "text", max: ISO_DATE },
      label: { kind: "text", max: LABEL_MAX },
      placeholder: { kind: "text", max: LABEL_MAX },
      disabled: { kind: "boolean" },
      error: { kind: "text", max: LABEL_MAX }
    },
    events: ["change"],
    children: false
  },
  "bry-split": {
    props: {
      ratio: { kind: "int", min: 20, max: 80 },
      label: { kind: "text", max: LABEL_MAX }
    },
    events: [],
    children: true
  },
  "bry-checkbox": {
    props: {
      checked: { kind: "boolean" },
      label: { kind: "text", max: LABEL_MAX },
      disabled: { kind: "boolean" },
      error: { kind: "text", max: LABEL_MAX }
    },
    required: ["label"],
    events: ["change"],
    children: false
  },
  "bry-switch": {
    props: {
      checked: { kind: "boolean" },
      label: { kind: "text", max: LABEL_MAX },
      disabled: { kind: "boolean" },
      error: { kind: "text", max: LABEL_MAX }
    },
    required: ["label"],
    events: ["change"],
    children: false
  },
  "bry-board": {
    props: {
      label: { kind: "text", max: LABEL_MAX },
      cardSize: { kind: "enum", values: ["sm", "md", "lg"] },
      settled: { kind: "text", max: KEY_MAX },
      loading: { kind: "boolean" },
      empty: { kind: "text", max: LABEL_MAX }
    },
    events: ["move"],
    children: true
  },
  "bry-board-column": {
    props: {
      title: { kind: "text", max: LABEL_MAX },
      count: { kind: "int", min: 0, max: BOARD_CARDS },
      limit: { kind: "int", min: 1, max: BOARD_CARDS },
      start: { kind: "int", min: 0, max: BOARD_CARDS },
      loading: { kind: "boolean" },
      empty: { kind: "text", max: LABEL_MAX }
    },
    required: ["title"],
    events: ["range"],
    children: true
  },
  "bry-markdown": {
    props: {
      text: { kind: "text", max: MARKDOWN_MAX },
      expanded: { kind: "boolean" }
    },
    required: ["text"],
    events: [],
    children: false
  },
  "bry-diff": {
    props: {
      files: {
        kind: "list",
        max: DIFF_FILES,
        of: {
          kind: "shape",
          fields: {
            path: { kind: "text", max: DIFF_PATH },
            previous: { kind: "text", max: DIFF_PATH },
            status: { kind: "enum", values: ["added", "modified", "removed", "renamed"] },
            patch: { kind: "text", max: DIFF_PATCH }
          },
          required: ["path"]
        }
      },
      label: { kind: "text", max: LABEL_MAX },
      loading: { kind: "boolean" },
      empty: { kind: "text", max: LABEL_MAX }
    },
    required: ["files"],
    events: ["expand", "select"],
    children: false
  },
  "bry-file-grid": {
    props: {
      label: { kind: "text", max: LABEL_MAX },
      count: { kind: "int", min: 0, max: FILE_GRID_COUNT },
      start: { kind: "int", min: 0, max: FILE_GRID_COUNT },
      files: {
        kind: "list",
        max: FILE_GRID_WINDOW,
        of: {
          kind: "shape",
          fields: {
            id: { kind: "text", max: KEY_MAX },
            name: { kind: "text", max: LABEL_MAX },
            kind: { kind: "enum", values: FILE_KINDS },
            preview: { kind: "text", max: KEY_MAX },
            size: { kind: "int", min: 0, max: 2000000000 },
            modified: { kind: "text", max: 40 }
          },
          required: ["id", "name", "kind"]
        }
      },
      tileSize: { kind: "enum", values: ["sm", "md", "lg"] },
      selectable: { kind: "boolean" },
      selected: { kind: "list", max: FILE_GRID_WINDOW, of: { kind: "text", max: KEY_MAX } },
      menu: {
        kind: "list",
        max: 12,
        of: {
          kind: "shape",
          fields: {
            id: { kind: "text", max: KEY_MAX },
            label: { kind: "text", max: LABEL_MAX },
            icon: { kind: "enum", values: MENU_ICONS },
            tone: { kind: "enum", values: ["default", "danger"] }
          },
          required: ["id", "label"]
        }
      },
      loading: { kind: "boolean" },
      empty: { kind: "text", max: LABEL_MAX }
    },
    required: ["count"],
    events: ["open", "select", "menu", "range"],
    children: false
  }
};
var ELEMENT_NAMES = Object.keys(CATALOGUE);
var TEXT_NODE = "#text";
var FORBIDDEN_PROPS = {
  style: "Brydio draws every element in its own style; there is no style setting.",
  className: "There are no classes in a Brydio app; choose a setting the element offers.",
  class: "There are no classes in a Brydio app; choose a setting the element offers.",
  color: "Colours come from Brydio’s tokens through a setting like tone, never a value.",
  colour: "Colours come from Brydio’s tokens through a setting like tone, never a value.",
  dangerouslySetInnerHTML: "A Brydio app has no HTML to set.",
  innerHTML: "A Brydio app has no HTML to set."
};
// ../ui/src/checks.ts
function isElementName(value) {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CATALOGUE, value);
}
function refusalFor(type, name, value) {
  const spec = CATALOGUE[type].props[name];
  if (!spec)
    return `${type} has no setting called "${name}".`;
  switch (spec.kind) {
    case "enum":
      return typeof value === "string" && spec.values.includes(value) ? null : `${type} ${name} must be one of ${spec.values.join(", ")}.`;
    case "text":
      return typeof value === "string" && value.length <= spec.max ? null : `${type} ${name} must be text of at most ${spec.max} characters.`;
    case "boolean":
      return typeof value === "boolean" ? null : `${type} ${name} must be true or false.`;
    case "int":
      return Number.isInteger(value) && value >= spec.min && value <= spec.max ? null : `${type} ${name} must be a whole number from ${spec.min} to ${spec.max}.`;
    case "options":
      return isOptions(value, spec.max) ? null : `${type} ${name} must be a list of at most ${spec.max} choices, each with a value and a label of at most ${LABEL_MAX} characters (and optionally a member id as avatar), and no value twice.`;
    case "list":
    case "shape":
      return refusalForValue(`${type} ${name}`, spec, value);
  }
}
function refusalForValue(label, spec, value) {
  switch (spec.kind) {
    case "enum":
      return typeof value === "string" && spec.values.includes(value) ? null : `${label} must be one of ${spec.values.join(", ")}.`;
    case "text":
      return typeof value === "string" && value.length <= spec.max ? null : `${label} must be text of at most ${spec.max} characters.`;
    case "boolean":
      return typeof value === "boolean" ? null : `${label} must be true or false.`;
    case "int":
      return Number.isInteger(value) && value >= spec.min && value <= spec.max ? null : `${label} must be a whole number from ${spec.min} to ${spec.max}.`;
    case "options":
      return `${label} can't hold a list of choices.`;
    case "list": {
      if (!Array.isArray(value) || value.length > spec.max)
        return `${label} must be a list of at most ${spec.max}.`;
      for (const [index, item] of value.entries()) {
        const refused = refusalForValue(`${label}[${index}]`, spec.of, item);
        if (refused)
          return refused;
      }
      return null;
    }
    case "shape": {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return `${label} must be a record with ${Object.keys(spec.fields).join(", ")}.`;
      }
      for (const [field, item] of Object.entries(value)) {
        const fieldSpec = spec.fields[field];
        if (!fieldSpec)
          return `${label} has no field called "${field}".`;
        if (item === undefined)
          continue;
        const refused = refusalForValue(`${label}.${field}`, fieldSpec, item);
        if (refused)
          return refused;
      }
      for (const field of spec.required ?? []) {
        if (value[field] === undefined)
          return `${label} needs a ${field}.`;
      }
      return null;
    }
  }
}
function isOptions(value, max) {
  if (!Array.isArray(value) || value.length > max)
    return false;
  const seen = new Set;
  for (const choice of value) {
    if (!choice || typeof choice !== "object" || Array.isArray(choice))
      return false;
    const { value: key, label, avatar, ...rest } = choice;
    if (Object.keys(rest).length > 0)
      return false;
    if (avatar !== undefined && (typeof avatar !== "string" || avatar.length === 0 || avatar.length > 128))
      return false;
    if (typeof key !== "string" || key.length === 0 || key.length > LABEL_MAX || seen.has(key))
      return false;
    if (typeof label !== "string" || label.length === 0 || label.length > LABEL_MAX)
      return false;
    seen.add(key);
  }
  return true;
}
function checkElement(type) {
  if (type === TEXT_NODE || isElementName(type))
    return null;
  return `Brydio has no element called "${String(type)}".`;
}
function checkProp(element, name, value) {
  const refused = refusalFor(element, name, value);
  if (!refused)
    return null;
  const why = FORBIDDEN_PROPS[name];
  return why ? `${refused} ${why}` : refused;
}
var handlerName = (event) => `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;
function eventOfHandler(name) {
  if (!/^on[A-Z]/.test(name))
    return null;
  return name.slice(2).toLowerCase();
}
function checkEvent(element, event) {
  const events = CATALOGUE[element].events;
  if (events.includes(event))
    return null;
  return events.length ? `${element} raises ${events.join(", ")}, not "${event}".` : `${element} raises no events, so it takes no ${handlerName(event)}.`;
}
// src/source-checks.ts
var import_node_path = require("node:path");
var import_typescript = __toESM(require("typescript"));
var PAGE = { code: "dom_global", why: "A screen has no page: it runs in a worker and draws only with the catalogue." };
var NETWORK = { code: "network_global", why: "A screen has no network; call the app’s tools instead." };
var STORAGE = { code: "storage_global", why: "A screen has no storage; keep records in the app’s collections." };
var WORKERS = { code: "worker_global", why: "A screen is one module in one worker; there is nothing else to start or load." };
var FORBIDDEN_GLOBALS = {
  document: PAGE,
  window: PAGE,
  localStorage: STORAGE,
  sessionStorage: STORAGE,
  indexedDB: STORAGE,
  caches: STORAGE,
  fetch: NETWORK,
  XMLHttpRequest: NETWORK,
  WebSocket: NETWORK,
  WebSocketStream: NETWORK,
  EventSource: NETWORK,
  WebTransport: NETWORK,
  Worker: WORKERS,
  SharedWorker: WORKERS,
  BroadcastChannel: WORKERS,
  importScripts: WORKERS
};
var NAVIGATOR = { storage: STORAGE, sendBeacon: NETWORK };
var GLOBAL_OBJECTS = new Set(["self", "globalThis", "window"]);
var FRAMEWORK_ATTRIBUTES = new Set(["key", "ref", "children"]);
var FACTORIES = {
  stack: "bry-stack",
  heading: "bry-heading",
  text: "bry-text",
  button: "bry-button",
  card: "bry-card",
  input: "bry-input",
  textarea: "bry-textarea",
  select: "bry-select",
  label: "bry-label",
  grid: "bry-grid",
  badge: "bry-badge",
  avatar: "bry-avatar",
  listRow: "bry-list-row",
  emptyState: "bry-empty-state",
  skeleton: "bry-skeleton",
  table: "bry-table",
  virtualList: "bry-virtual-list",
  dialog: "bry-dialog",
  menu: "bry-menu",
  date: "bry-date",
  split: "bry-split",
  checkbox: "bry-checkbox",
  switchElement: "bry-switch",
  board: "bry-board",
  boardColumn: "bry-board-column",
  markdown: "bry-markdown",
  diff: "bry-diff"
};
var ELEMENT_MAKERS = new Set(["@brydio/app", "preact"]);
var ALLOWED_PACKAGES = /^(@brydio\/[a-z0-9-]+(\/.*)?|preact|preact\/(hooks|jsx-runtime|jsx-dev-runtime))$/;
function importRefusal(file, specifier) {
  if (specifier.startsWith("./") || specifier.startsWith("../") || specifier === "." || specifier === "..") {
    const inside = import_node_path.posix.normalize(import_node_path.posix.join(import_node_path.posix.dirname(file.split("\\").join("/")), specifier));
    return inside === ".." || inside.startsWith("../") || import_node_path.posix.isAbsolute(inside) ? `import "${specifier}" reaches outside the app's folder. A screen imports only its own files, @brydio packages and Preact.` : null;
  }
  if (ALLOWED_PACKAGES.test(specifier))
    return null;
  if (specifier.startsWith("/") || /^[A-Za-z]:[\\/]/.test(specifier) || /^[a-z][a-z0-9+.-]*:/i.test(specifier)) {
    return `import "${specifier}" names a place, not the app's own file. A screen imports only its own files, @brydio packages and Preact.`;
  }
  return `import "${specifier}": a screen imports only its own files, @brydio packages and Preact. Anything else it needs belongs in the SDK.`;
}
var scriptKindOf = (file) => file.endsWith(".tsx") ? import_typescript.default.ScriptKind.TSX : file.endsWith(".ts") || file.endsWith(".mts") ? import_typescript.default.ScriptKind.TS : import_typescript.default.ScriptKind.JSX;
function literalsOf(expression) {
  if (!expression)
    return [undefined];
  const node = unwrap(expression);
  if (import_typescript.default.isStringLiteral(node) || import_typescript.default.isNoSubstitutionTemplateLiteral(node))
    return [{ value: node.text }];
  if (import_typescript.default.isNumericLiteral(node))
    return [{ value: Number(node.text) }];
  if (node.kind === import_typescript.default.SyntaxKind.TrueKeyword)
    return [{ value: true }];
  if (node.kind === import_typescript.default.SyntaxKind.FalseKeyword)
    return [{ value: false }];
  if (import_typescript.default.isPrefixUnaryExpression(node) && node.operator === import_typescript.default.SyntaxKind.MinusToken && import_typescript.default.isNumericLiteral(node.operand)) {
    return [{ value: -Number(node.operand.text) }];
  }
  if (import_typescript.default.isConditionalExpression(node))
    return [...literalsOf(node.whenTrue), ...literalsOf(node.whenFalse)];
  return [undefined];
}
function unwrap(node) {
  let at = node;
  while (import_typescript.default.isParenthesizedExpression(at) || import_typescript.default.isAsExpression(at) || import_typescript.default.isSatisfiesExpression(at) || import_typescript.default.isNonNullExpression(at)) {
    at = at.expression;
  }
  return at;
}
var isWrittenString = (node) => import_typescript.default.isStringLiteral(node) || import_typescript.default.isNoSubstitutionTemplateLiteral(node);
function declaredNames(source) {
  const names = new Set;
  const addBinding = (name) => {
    if (import_typescript.default.isIdentifier(name))
      names.add(name.text);
    else
      for (const element of name.elements)
        if (!import_typescript.default.isOmittedExpression(element))
          addBinding(element.name);
  };
  const visit = (node) => {
    if (import_typescript.default.isVariableDeclaration(node) || import_typescript.default.isParameter(node) || import_typescript.default.isBindingElement(node))
      addBinding(node.name);
    else if ((import_typescript.default.isFunctionDeclaration(node) || import_typescript.default.isClassDeclaration(node) || import_typescript.default.isFunctionExpression(node) || import_typescript.default.isClassExpression(node)) && node.name) {
      names.add(node.name.text);
    } else if (import_typescript.default.isImportClause(node) && node.name)
      names.add(node.name.text);
    else if (import_typescript.default.isImportSpecifier(node) || import_typescript.default.isNamespaceImport(node) || import_typescript.default.isImportEqualsDeclaration(node))
      names.add(node.name.text);
    else if ((import_typescript.default.isEnumDeclaration(node) || import_typescript.default.isModuleDeclaration(node)) && import_typescript.default.isIdentifier(node.name))
      names.add(node.name.text);
    import_typescript.default.forEachChild(node, visit);
  };
  visit(source);
  return names;
}
function isValueReference(node) {
  const parent = node.parent;
  if (import_typescript.default.isPropertyAccessExpression(parent))
    return parent.expression === node;
  if ((import_typescript.default.isPropertyAssignment(parent) || import_typescript.default.isPropertyDeclaration(parent) || import_typescript.default.isPropertySignature(parent) || import_typescript.default.isMethodDeclaration(parent) || import_typescript.default.isMethodSignature(parent) || import_typescript.default.isGetAccessor(parent) || import_typescript.default.isSetAccessor(parent) || import_typescript.default.isEnumMember(parent)) && parent.name === node) {
    return false;
  }
  if (import_typescript.default.isQualifiedName(parent) || import_typescript.default.isJsxAttribute(parent) || import_typescript.default.isLabeledStatement(parent) || import_typescript.default.isBreakOrContinueStatement(parent) || import_typescript.default.isImportSpecifier(parent) || import_typescript.default.isExportSpecifier(parent) || import_typescript.default.isImportClause(parent) || import_typescript.default.isNamespaceImport(parent)) {
    return false;
  }
  for (let at = parent;!import_typescript.default.isSourceFile(at); at = at.parent) {
    if (import_typescript.default.isTypeNode(at) && !import_typescript.default.isExpressionWithTypeArguments(at))
      return false;
    if (import_typescript.default.isInterfaceDeclaration(at) || import_typescript.default.isTypeAliasDeclaration(at))
      return false;
    if (import_typescript.default.isStatement(at))
      break;
  }
  return true;
}
function settingsOf(object) {
  const settings = [];
  let complete = true;
  for (const property of object.properties) {
    if (import_typescript.default.isSpreadAssignment(property)) {
      const inner = unwrap(property.expression);
      if (import_typescript.default.isObjectLiteralExpression(inner)) {
        const nested = settingsOf(inner);
        settings.push(...nested.settings);
        complete &&= nested.complete;
      } else {
        complete = false;
      }
      continue;
    }
    const key = property.name;
    const name = key && (import_typescript.default.isIdentifier(key) || import_typescript.default.isStringLiteral(key) || import_typescript.default.isNumericLiteral(key)) ? key.text : null;
    if (name === null || !key) {
      complete = false;
      continue;
    }
    settings.push({ name, values: import_typescript.default.isPropertyAssignment(property) ? literalsOf(property.initializer) : [undefined], at: key });
  }
  return { settings, complete };
}
function checkSource(file, text) {
  const source = import_typescript.default.createSourceFile(file, text, import_typescript.default.ScriptTarget.Latest, true, scriptKindOf(file));
  const problems = [];
  const place = (position) => {
    const { line, character } = source.getLineAndCharacterOfPosition(position);
    return { line: line + 1, column: character + 1 };
  };
  const push = (code, message, at, hint) => problems.push({ code, severity: "error", file, ...place(at.getStart(source)), message, ...hint ? { hint } : {} });
  const syntax = source.parseDiagnostics ?? [];
  if (syntax.length) {
    return syntax.slice(0, 5).map((diagnostic) => ({
      code: "source_syntax",
      severity: "error",
      file,
      ...place(diagnostic.start),
      message: `This does not parse: ${import_typescript.default.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`
    }));
  }
  const declared = declaredNames(source);
  const makers = new Set;
  const factories = new Map;
  for (const statement of source.statements) {
    if (!import_typescript.default.isImportDeclaration(statement) || !import_typescript.default.isStringLiteral(statement.moduleSpecifier))
      continue;
    const from = statement.moduleSpecifier.text;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !import_typescript.default.isNamedImports(bindings))
      continue;
    for (const specifier of bindings.elements) {
      const imported = (specifier.propertyName ?? specifier.name).text;
      if (ELEMENT_MAKERS.has(from) && (imported === "h" || imported === "createElement"))
        makers.add(specifier.name.text);
      if (from === "@brydio/app" && FACTORIES[imported])
        factories.set(specifier.name.text, FACTORIES[imported]);
    }
  }
  const checkSetting = (element, { name, values, at }) => {
    if (FRAMEWORK_ATTRIBUTES.has(name))
      return;
    const event = eventOfHandler(name);
    if (event !== null) {
      const refused = checkEvent(element, event);
      if (refused)
        push("event_unknown", refused, at);
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(CATALOGUE[element].props, name)) {
      const forbidden = Object.prototype.hasOwnProperty.call(FORBIDDEN_PROPS, name);
      push(forbidden ? "style_forbidden" : "prop_unknown", refusalFor(element, name, undefined), at, forbidden ? FORBIDDEN_PROPS[name] : undefined);
      return;
    }
    for (const literal of values) {
      const refused = literal && checkProp(element, name, literal.value);
      if (refused) {
        push("prop_value_invalid", refused, at);
        return;
      }
    }
  };
  const checkRequired = (element, written, at) => {
    for (const required of CATALOGUE[element].required ?? []) {
      if (!written.some((setting) => setting.name === required))
        push("prop_required", `${element} needs a ${required}.`, at);
    }
  };
  const isKnownElement = (name, at) => {
    if (isElementName(name))
      return true;
    push("element_unknown", checkElement(name), at, `A screen draws with ${Object.keys(CATALOGUE).join(", ")}.`);
    return false;
  };
  const checkJsx = (opening, children) => {
    const tag = opening.tagName;
    if (!import_typescript.default.isIdentifier(tag) || !/^[a-z]/.test(tag.text)) {
      if (import_typescript.default.isJsxNamespacedName(tag))
        push("element_unknown", checkElement(tag.getText(source)), tag);
      return;
    }
    const name = tag.text;
    if (!isKnownElement(name, tag))
      return;
    const written = [];
    let complete = true;
    for (const attribute of opening.attributes.properties) {
      if (import_typescript.default.isJsxSpreadAttribute(attribute)) {
        const inner = unwrap(attribute.expression);
        if (import_typescript.default.isObjectLiteralExpression(inner)) {
          const spread = settingsOf(inner);
          written.push(...spread.settings);
          complete &&= spread.complete;
        } else {
          complete = false;
        }
        continue;
      }
      const initializer = attribute.initializer;
      written.push({
        name: attribute.name.getText(source),
        values: !initializer ? [{ value: true }] : import_typescript.default.isStringLiteral(initializer) ? [{ value: initializer.text }] : import_typescript.default.isJsxExpression(initializer) ? literalsOf(initializer.expression) : [undefined],
        at: attribute.name
      });
    }
    written.forEach((setting) => checkSetting(name, setting));
    if (complete)
      checkRequired(name, written, tag);
    if (!CATALOGUE[name].children) {
      const held = children.find((child) => import_typescript.default.isJsxText(child) ? child.text.trim() !== "" : import_typescript.default.isJsxExpression(child) ? child.expression !== undefined : true);
      if (held) {
        const words = name === "bry-button" ? ' Give it its words as label="…".' : ("text" in CATALOGUE[name].props) ? ' Give it its words as text="…".' : "";
        push("children_not_allowed", `${name} can’t hold other nodes.${words}`, held);
      }
    }
  };
  const checkFactory = (element, argument, at) => {
    const attributes = argument && unwrap(argument);
    if (!attributes || attributes.kind === import_typescript.default.SyntaxKind.NullKeyword || import_typescript.default.isIdentifier(attributes) && attributes.text === "undefined") {
      checkRequired(element, [], at);
      return;
    }
    if (!import_typescript.default.isObjectLiteralExpression(attributes))
      return;
    const { settings, complete } = settingsOf(attributes);
    settings.forEach((setting) => checkSetting(element, setting));
    if (complete)
      checkRequired(element, settings, at);
  };
  const checkImport = (specifier) => {
    const refused = importRefusal(file, specifier.text);
    if (refused)
      push("import_not_allowed", refused, specifier);
  };
  const checkCall = (call) => {
    const callee = unwrap(call.expression);
    const [first, second] = call.arguments;
    if (import_typescript.default.isIdentifier(callee) && makers.has(callee.text) && first) {
      const tag = unwrap(first);
      if (isWrittenString(tag) && tag.text !== "#text" && isKnownElement(tag.text, tag))
        checkFactory(tag.text, second, tag);
      return;
    }
    if (import_typescript.default.isIdentifier(callee) && factories.has(callee.text)) {
      checkFactory(factories.get(callee.text), first, callee);
      return;
    }
    if (import_typescript.default.isIdentifier(callee) && callee.text === "eval" && !declared.has("eval")) {
      push("eval_forbidden", "eval is refused in a Brydio app’s worker; write the code out.", callee);
    }
    if (callee.kind === import_typescript.default.SyntaxKind.ImportKeyword && first) {
      const target = unwrap(first);
      if (isWrittenString(target) && /^(https?:|\/\/)/i.test(target.text)) {
        push("network_global", `import("${target.text}"): a screen can load nothing from elsewhere; build it into the bundle.`, target);
      } else if (isWrittenString(target)) {
        checkImport(target);
      }
    }
    if (import_typescript.default.isIdentifier(callee) && callee.text === "require" && !declared.has("require") && first && isWrittenString(unwrap(first))) {
      checkImport(unwrap(first));
    }
  };
  const visit = (node) => {
    if ((import_typescript.default.isImportDeclaration(node) || import_typescript.default.isExportDeclaration(node)) && node.moduleSpecifier && import_typescript.default.isStringLiteral(node.moduleSpecifier)) {
      checkImport(node.moduleSpecifier);
    } else if (import_typescript.default.isImportEqualsDeclaration(node) && import_typescript.default.isExternalModuleReference(node.moduleReference) && import_typescript.default.isStringLiteral(node.moduleReference.expression)) {
      checkImport(node.moduleReference.expression);
    }
    if (import_typescript.default.isJsxElement(node)) {
      checkJsx(node.openingElement, node.children);
    } else if (import_typescript.default.isJsxSelfClosingElement(node)) {
      checkJsx(node, []);
    } else if (import_typescript.default.isCallExpression(node)) {
      checkCall(node);
    } else if (import_typescript.default.isNewExpression(node)) {
      const callee = unwrap(node.expression);
      if (import_typescript.default.isIdentifier(callee) && callee.text === "Function" && !declared.has("Function")) {
        push("eval_forbidden", "new Function is refused in a Brydio app’s worker; write the code out.", callee);
      }
    } else if (import_typescript.default.isIdentifier(node)) {
      const refused = FORBIDDEN_GLOBALS[node.text];
      if (refused && Object.prototype.hasOwnProperty.call(FORBIDDEN_GLOBALS, node.text) && !declared.has(node.text) && isValueReference(node)) {
        push(refused.code, `${node.text}: ${refused.why}`, node);
      }
    } else if (import_typescript.default.isPropertyAccessExpression(node) || import_typescript.default.isElementAccessExpression(node)) {
      const object = unwrap(node.expression);
      const property = import_typescript.default.isPropertyAccessExpression(node) ? node.name.text : isWrittenString(node.argumentExpression) ? node.argumentExpression.text : null;
      if (property !== null && import_typescript.default.isIdentifier(object) && !declared.has(object.text)) {
        const refused = GLOBAL_OBJECTS.has(object.text) ? Object.prototype.hasOwnProperty.call(FORBIDDEN_GLOBALS, property) && FORBIDDEN_GLOBALS[property] : object.text === "navigator" && Object.prototype.hasOwnProperty.call(NAVIGATOR, property) && NAVIGATOR[property];
        if (refused)
          push(refused.code, `${object.text}.${property}: ${refused.why}`, node);
      }
    }
    import_typescript.default.forEachChild(node, visit);
  };
  visit(source);
  return dedupe(problems);
}
function dedupe(problems) {
  const seen = new Set;
  return problems.filter((problem) => {
    const key = `${problem.line}:${problem.column}:${problem.code}`;
    if (seen.has(key))
      return false;
    seen.add(key);
    return true;
  });
}

// src/screen-sources.ts
var SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];
function isScreenSource(path) {
  const normal = path.replace(/\\/g, "/");
  return /^src\//.test(normal) && SOURCE_EXTENSIONS.some((extension) => normal.endsWith(extension)) && !normal.endsWith(".d.ts") && !/(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[jt]sx?$/.test(normal);
}

// src/ts-plugin.ts
var PLUGIN_SOURCE = "brydio";
var PLUGIN_CODE = 91000;
function appRootOf(file) {
  for (let at = import_node_path2.dirname(file);; at = import_node_path2.dirname(at)) {
    if (import_node_fs.existsSync(import_node_path2.join(at, ".brydio", "app.json")))
      return at;
    if (import_node_path2.dirname(at) === at)
      return null;
  }
}
function brydioDiagnostics(tsModule, file, root = appRootOf(file.fileName)) {
  if (!root || !isScreenSource(import_node_path2.relative(root, file.fileName)))
    return [];
  return checkSource(import_node_path2.relative(root, file.fileName), file.text).filter((problem) => problem.code !== "source_syntax").map((problem) => {
    const start = file.getPositionOfLineAndCharacter(Math.max(0, (problem.line ?? 1) - 1), Math.max(0, (problem.column ?? 1) - 1));
    const word = /^[\w$-]+/.exec(file.text.slice(start))?.[0] ?? "";
    return {
      file,
      start,
      length: Math.max(1, word.length),
      messageText: `${problem.message}${problem.hint ? ` ${problem.hint}` : ""} [${problem.code}]`,
      category: tsModule.DiagnosticCategory.Error,
      code: PLUGIN_CODE,
      source: PLUGIN_SOURCE
    };
  });
}
function init(modules) {
  const tsModule = modules.typescript;
  return {
    create(info) {
      const service = info.languageService;
      const proxy = Object.create(null);
      for (const key of Object.keys(service)) {
        const member = service[key];
        proxy[key] = typeof member === "function" ? (...args) => member.apply(service, args) : member;
      }
      proxy.getSemanticDiagnostics = (fileName) => {
        const prior = service.getSemanticDiagnostics(fileName);
        const file = service.getProgram()?.getSourceFile(fileName);
        if (!file)
          return prior;
        try {
          return [...prior, ...brydioDiagnostics(tsModule, file)];
        } catch (error) {
          info.project.projectService.logger.info(`brydio: ${error instanceof Error ? error.message : String(error)}`);
          return prior;
        }
      };
      return proxy;
    }
  };
}
var ts_plugin_default = init;
