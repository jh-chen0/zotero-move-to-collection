const PLUGIN_ID = "move-to-collection@local.openai";
const MENU_REGISTRATION_ID = "move-to-collection-context-menu";
const RECENT_COUNT = 5;

let registeredMenuID = null;

function log(message) {
  try {
    Zotero.debug(`[Move to Collection] ${message}`);
  }
  catch (_) {}
}

function install() {
  log("Installed");
}

async function startup({ id, version, rootURI }) {
  log(`Starting ${version}`);

  registeredMenuID = Zotero.MenuManager.registerMenu({
    menuID: MENU_REGISTRATION_ID,
    pluginID: PLUGIN_ID,
    target: "main/library/item",
    menus: [
      {
        menuType: "submenu",
        // The label is assigned dynamically in onShowing so we can localize it
        // without bundling/registration of a Fluent localization file.
        onShowing: (event, context) => {
          let state = getMoveState(context);
          context.setVisible(!!state);

          let menuElem = context.menuElem;
          if (!menuElem) return;
          menuElem.setAttribute("label", labels().moveTo);

          if (!state) return;

          let popup = menuElem.querySelector("menupopup");
          if (!popup) return;

          // MenuManager initializes its declared submenu items first. We then
          // replace that placeholder content with the live Collection tree.
          popup.addEventListener("popupshowing", ev => {
            if (ev.target !== ev.currentTarget) return;
            buildDynamicPopup(popup, state);
          }, { once: true });
        },
        // MenuManager requires submenus to contain at least one declared menu.
        // This placeholder is replaced when the submenu is opened.
        menus: [
          {
            menuType: "menuitem"
          }
        ]
      }
    ]
  });

  if (!registeredMenuID) {
    throw new Error("Move to Collection: failed to register context menu");
  }
}

function onMainWindowLoad({ window }) {
  // No per-window DOM injection is needed. Zotero.MenuManager handles windows.
}

function onMainWindowUnload({ window }) {
  // No per-window cleanup is needed.
}

function shutdown() {
  log("Shutting down");
  if (registeredMenuID) {
    try {
      Zotero.MenuManager.unregisterMenu(registeredMenuID);
    }
    catch (e) {
      Zotero.logError(e);
    }
    registeredMenuID = null;
  }
}

function uninstall() {
  log("Uninstalled");
}

function isChineseLocale() {
  let locale = "";
  try {
    locale = Zotero.locale || Services.locale?.appLocaleAsBCP47 || "";
  }
  catch (_) {}
  return /^zh(?:-|$)/i.test(locale);
}

function labels() {
  if (isChineseLocale()) {
    return {
      moveTo: "移动到分类",
      moveHere: name => `移动到“${name}”`,
      empty: "没有可用的目标分类"
    };
  }
  return {
    moveTo: "Move to Collection",
    moveHere: name => `Move to “${name}”`,
    empty: "No available destination collections"
  };
}

function getMoveState(context) {
  try {
    let rows = context.collectionTreeRows || [];
    if (rows.length !== 1) return null;

    let row = rows[0];
    if (!row || typeof row.isCollection !== "function" || !row.isCollection()) {
      return null;
    }
    if (row.editable === false) return null;

    let source = row.ref;
    if (!source || !source.id || !source.libraryID) return null;

    let items = context.items || [];
    if (!items.length) return null;

    // Match Zotero's normal Collection semantics: move actual top-level items,
    // not child attachments/notes/annotations via an implicit parent conversion.
    if (!items.every(item => item && item.isTopLevelItem && item.isTopLevelItem())) {
      return null;
    }
    if (!items.every(item => item.libraryID === source.libraryID)) {
      return null;
    }

    return {
      source,
      items: items.slice(),
      libraryID: source.libraryID,
      window: context.menuElem?.ownerDocument?.defaultView || null
    };
  }
  catch (e) {
    Zotero.logError(e);
    return null;
  }
}

function getAllCollections(libraryID) {
  try {
    // true = include descendants/subcollections
    return Zotero.Collections.getByLibrary(libraryID, true) || [];
  }
  catch (e) {
    Zotero.logError(e);
    return [];
  }
}

function compareNames(a, b) {
  return String(a.name || "").localeCompare(String(b.name || ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function getCollectionPathLabel(collection) {
  let names = [];
  let current = collection;
  let guard = new Set();

  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    names.unshift(current.name || "");
    if (!current.parentID) break;
    current = Zotero.Collections.get(current.parentID);
  }
  return names.join(" › ");
}

function clearPopup(popup) {
  while (popup.firstChild) {
    popup.firstChild.remove();
  }
}

function createMenuItem(doc, label, onCommand, disabled = false) {
  let item = doc.createXULElement("menuitem");
  item.setAttribute("label", label);
  if (disabled) item.setAttribute("disabled", "true");

  if (onCommand) {
    item.addEventListener("command", async event => {
      event.stopPropagation();
      try {
        await onCommand();
      }
      catch (e) {
        Zotero.logError(e);
      }
    });
  }
  return item;
}

function createSeparator(doc) {
  return doc.createXULElement("menuseparator");
}

function makeCollectionNode(doc, collection, childrenMap, state) {
  let children = (childrenMap.get(collection.id) || []).slice().sort(compareNames);
  let move = () => moveItems(state, collection);

  if (!children.length) {
    return createMenuItem(doc, collection.name, move);
  }

  let menu = doc.createXULElement("menu");
  menu.setAttribute("label", collection.name);
  let popup = doc.createXULElement("menupopup");

  // A collection with subcollections is itself also a valid destination.
  popup.appendChild(createMenuItem(doc, labels().moveHere(collection.name), move));
  popup.appendChild(createSeparator(doc));

  for (let child of children) {
    popup.appendChild(makeCollectionNode(doc, child, childrenMap, state));
  }

  menu.appendChild(popup);
  return menu;
}

function buildDynamicPopup(popup, state) {
  clearPopup(popup);
  let doc = popup.ownerDocument;

  // Refresh objects in case collections changed while the context menu was open.
  let source = Zotero.Collections.get(state.source.id);
  if (!source) {
    popup.appendChild(createMenuItem(doc, labels().empty, null, true));
    return;
  }
  state.source = source;

  let all = getAllCollections(state.libraryID)
    .filter(collection => collection && collection.id !== source.id);

  if (!all.length) {
    popup.appendChild(createMenuItem(doc, labels().empty, null, true));
    return;
  }

  // Recently used collections appear at the top, like Zotero's native
  // "Add to Collection" menu introduced in Zotero 10.0.2.
  let recent = [];
  try {
    recent = (Zotero.Collections.getRecent(state.libraryID) || [])
      .filter(collection =>
        collection
        && collection.libraryID === state.libraryID
        && collection.id !== source.id
      )
      .slice(0, RECENT_COUNT);
  }
  catch (e) {
    Zotero.logError(e);
  }

  for (let collection of recent) {
    popup.appendChild(createMenuItem(
      doc,
      getCollectionPathLabel(collection),
      () => moveItems(state, collection)
    ));
  }
  if (recent.length) {
    popup.appendChild(createSeparator(doc));
  }

  let childrenMap = new Map();
  let allIDs = new Set(all.map(collection => collection.id));
  for (let collection of all) {
    let parentID = collection.parentID || 0;
    if (!childrenMap.has(parentID)) childrenMap.set(parentID, []);
    childrenMap.get(parentID).push(collection);
  }

  // Normally roots are top-level collections. If the current source Collection
  // is excluded from the destination tree, its direct children are promoted so
  // they remain reachable as move targets.
  let roots = all.filter(collection =>
    !collection.parentID
    || collection.parentID === source.id
    || !allIDs.has(collection.parentID)
  ).sort(compareNames);

  for (let collection of roots) {
    popup.appendChild(makeCollectionNode(doc, collection, childrenMap, state));
  }
}

async function moveItems(state, target) {
  let source = Zotero.Collections.get(state.source.id);
  let destination = Zotero.Collections.get(target.id);
  if (!source || !destination) return;
  if (source.id === destination.id) return;
  if (source.libraryID !== destination.libraryID) {
    throw new Error("Move to Collection: source and destination must be in the same library");
  }

  // Reload items so the operation uses the latest object state.
  let itemIDs = state.items.map(item => item.id);
  let items = Zotero.Items.get(itemIDs).filter(Boolean);
  if (!items.length) return;

  await Zotero.DB.executeTransaction(async () => {
    for (let item of items) {
      if (item.libraryID !== source.libraryID || !item.isTopLevelItem()) continue;

      if (!destination.hasItem(item)) {
        item.addToCollection(destination.id);
      }
      if (source.hasItem(item)) {
        item.removeFromCollection(source.id);
      }

      // Collection membership changes should not alter bibliographic modified time.
      await item.save({
        skipDateModifiedUpdate: true,
        skipSelect: true
      });
    }
  });

  try {
    Zotero.Collections.addToRecent(destination);
  }
  catch (e) {
    Zotero.logError(e);
  }
}
