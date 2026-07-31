import { 
  getDecks, getFolders, getSubjects, getFlashcards, 
  createSubject, createFolder, updateFolder, createDeck, createFlashcard,
  Folder, Deck 
} from "./db";

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9_\-\s]/gi, "_").trim() || "export";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function compressPayload(payload: object): Promise<Blob> {
  const jsonStr = JSON.stringify(payload);
  if (typeof CompressionStream !== "undefined") {
    const blobStream = new Blob([jsonStr]).stream();
    const compressedStream = blobStream.pipeThrough(new CompressionStream("gzip"));
    const response = new Response(compressedStream);
    return await response.blob();
  }
  // Fallback to uncompressed blob if CompressionStream is not available
  return new Blob([jsonStr], { type: "application/json" });
}

async function decompressFile(file: File): Promise<any> {
  if (typeof DecompressionStream !== "undefined") {
    try {
      const stream = file.stream().pipeThrough(new DecompressionStream("gzip"));
      const response = new Response(stream);
      const text = await response.text();
      return JSON.parse(text);
    } catch (e) {
      // Fallback: If not gzipped or uncompress failed, try parsing plain JSON text
      const text = await file.text();
      return JSON.parse(text);
    }
  }
  const text = await file.text();
  return JSON.parse(text);
}

// ---------------- EXPORT DECK (.oxdeck) ----------------
export async function exportDeck(deckId: string): Promise<string> {
  const allDecks = await getDecks();
  const deck = allDecks.find((d) => d.id === deckId);
  if (!deck) throw new Error("Deck not found.");

  const cards = await getFlashcards(deckId);

  const payload = {
    version: "1.0",
    type: "deck",
    exported_at: new Date().toISOString(),
    deck: {
      name: deck.name,
      icon: deck.icon,
      description: deck.description,
    },
    flashcards: cards.map((c) => ({
      front: c.front,
      back: c.back,
      tags: c.tags,
      image_url: c.image_url || null,
      front_image_url: c.front_image_url || null,
      back_image_url: c.back_image_url || null,
    })),
  };

  const filename = `${sanitizeFilename(deck.name)}.oxdeck`;
  const blob = await compressPayload(payload);
  downloadBlob(blob, filename);
  return filename;
}

// ---------------- EXPORT FOLDER (.oxfolder) ----------------
export async function exportFolder(folderId: string): Promise<string> {
  const allFolders = await getFolders();
  const rootFolder = allFolders.find((f) => f.id === folderId);
  if (!rootFolder) throw new Error("Folder not found.");

  // Gather all recursive subfolders
  const folderIds = new Set<string>([folderId]);
  let addedNew = true;
  while (addedNew) {
    addedNew = false;
    for (const f of allFolders) {
      if (f.parent_folder_id && folderIds.has(f.parent_folder_id) && !folderIds.has(f.id)) {
        folderIds.add(f.id);
        addedNew = true;
      }
    }
  }

  const subfolders = allFolders.filter((f) => folderIds.has(f.id));
  const allDecks = await getDecks();
  const exportedDecks = allDecks.filter((d) => d.folder_id && folderIds.has(d.folder_id));

  const flashcardsPayload: any[] = [];
  for (const deck of exportedDecks) {
    const cards = await getFlashcards(deck.id);
    for (const c of cards) {
      flashcardsPayload.push({
        _deck_temp_id: deck.id,
        front: c.front,
        back: c.back,
        tags: c.tags,
        image_url: c.image_url || null,
        front_image_url: c.front_image_url || null,
        back_image_url: c.back_image_url || null,
      });
    }
  }

  const payload = {
    version: "1.0",
    type: "folder",
    exported_at: new Date().toISOString(),
    root_folder_id: rootFolder.id,
    folders: subfolders,
    decks: exportedDecks,
    flashcards: flashcardsPayload,
  };

  const filename = `${sanitizeFilename(rootFolder.name)}.oxfolder`;
  const blob = await compressPayload(payload);
  downloadBlob(blob, filename);
  return filename;
}

// ---------------- EXPORT SUBJECT (.oxsubject) ----------------
export async function exportSubject(subjectId: string): Promise<string> {
  const allSubjects = await getSubjects();
  const subject = allSubjects.find((s) => s.id === subjectId);
  if (!subject) throw new Error("Subject not found.");

  const allFolders = await getFolders();
  const subjectFolders = allFolders.filter((f) => f.subject_id === subjectId);

  const folderIds = new Set<string>(subjectFolders.map((f) => f.id));
  let addedNew = true;
  while (addedNew) {
    addedNew = false;
    for (const f of allFolders) {
      if (f.parent_folder_id && folderIds.has(f.parent_folder_id) && !folderIds.has(f.id)) {
        folderIds.add(f.id);
        addedNew = true;
      }
    }
  }

  const exportedFolders = allFolders.filter((f) => folderIds.has(f.id));
  const allDecks = await getDecks();
  const exportedDecks = allDecks.filter((d) => d.folder_id && folderIds.has(d.folder_id));

  const flashcardsPayload: any[] = [];
  for (const deck of exportedDecks) {
    const cards = await getFlashcards(deck.id);
    for (const c of cards) {
      flashcardsPayload.push({
        _deck_temp_id: deck.id,
        front: c.front,
        back: c.back,
        tags: c.tags,
        image_url: c.image_url || null,
        front_image_url: c.front_image_url || null,
        back_image_url: c.back_image_url || null,
      });
    }
  }

  const payload = {
    version: "1.0",
    type: "subject",
    exported_at: new Date().toISOString(),
    subject: {
      name: subject.name,
      icon: subject.icon,
      color: subject.color,
    },
    folders: exportedFolders,
    decks: exportedDecks,
    flashcards: flashcardsPayload,
  };

  const filename = `${sanitizeFilename(subject.name)}.oxsubject`;
  const blob = await compressPayload(payload);
  downloadBlob(blob, filename);
  return filename;
}

async function getValidSubjectId(subjectId?: string | null): Promise<string | null> {
  if (!subjectId) return null;
  const subjects = await getSubjects();
  return subjects.some((s) => s.id === subjectId) ? subjectId : null;
}

async function getValidFolderId(folderId?: string | null): Promise<string | null> {
  if (!folderId) return null;
  const folders = await getFolders();
  return folders.some((f) => f.id === folderId) ? folderId : null;
}

// ---------------- IMPORT PACKAGE (.oxdeck, .oxfolder, .oxsubject) ----------------
export async function importOxidePackage(
  file: File, 
  targetFolderId?: string | null, 
  targetSubjectId?: string | null
): Promise<string> {
  const data = await decompressFile(file);
  if (!data || typeof data !== "object") {
    throw new Error("Invalid package format: file is empty or corrupted.");
  }

  const packageType = data.type || (data.deck ? "deck" : data.subject ? "subject" : data.folders ? "folder" : null);
  if (!packageType) {
    throw new Error("Unrecognized package format. Expected .oxdeck, .oxfolder, or .oxsubject.");
  }

  const validTargetFolderId = await getValidFolderId(targetFolderId);
  const validTargetSubjectId = await getValidSubjectId(targetSubjectId);

  // 1. IMPORT DECK PACKAGE
  if (packageType === "deck") {
    const deckMeta = data.deck || {};
    const deckName = deckMeta.name || file.name.replace(/\.[^/.]+$/, "");
    const newDeck = await createDeck(deckName, validTargetFolderId, deckMeta.icon || "🎴", deckMeta.description || "");

    const cards = data.flashcards || [];
    let importedCards = 0;
    for (const c of cards) {
      await createFlashcard(
        newDeck.id,
        c.front || "(Blank)",
        c.back || "(Blank)",
        c.tags || "",
        c.image_url || null,
        c.front_image_url || null,
        c.back_image_url || null
      );
      importedCards++;
    }
    return `Imported Deck "${newDeck.name}" with ${importedCards} flashcard(s)!`;
  }

  // 2. IMPORT FOLDER PACKAGE
  if (packageType === "folder") {
    const rawFolders: Folder[] = data.folders || [];
    const rawDecks: Deck[] = data.decks || [];
    const rawCards: any[] = data.flashcards || [];

    const folderIdMap = new Map<string, string>(); // oldId -> newId
    const deckIdMap = new Map<string, string>();   // oldId -> newId

    // Pass 1: Create all folders initially with parent_folder_id = null to avoid ordering issues or non-existent parent FK errors
    for (const f of rawFolders) {
      const subjIdVal = validTargetSubjectId || (await getValidSubjectId(f.subject_id));
      const created = await createFolder(f.name, f.icon || "📁", f.color || "#6366f1", subjIdVal, null);
      folderIdMap.set(f.id, created.id);
    }

    // Pass 2: Connect parent-child folder relationships and target folder attachment
    for (const f of rawFolders) {
      const newFolderId = folderIdMap.get(f.id);
      if (!newFolderId) continue;

      let parentIdMapped: string | null = null;
      if (f.parent_folder_id && folderIdMap.has(f.parent_folder_id)) {
        parentIdMapped = folderIdMap.get(f.parent_folder_id)!;
      } else if (validTargetFolderId) {
        parentIdMapped = validTargetFolderId;
      }

      if (parentIdMapped) {
        const subjIdVal = validTargetSubjectId || (await getValidSubjectId(f.subject_id));
        await updateFolder(newFolderId, f.name, f.icon || "📁", f.color || "#6366f1", subjIdVal, parentIdMapped);
      }
    }

    // Re-create decks
    let importedDecks = 0;
    for (const d of rawDecks) {
      let mappedFolderId: string | null = null;
      if (d.folder_id && folderIdMap.has(d.folder_id)) {
        mappedFolderId = folderIdMap.get(d.folder_id)!;
      } else {
        mappedFolderId = validTargetFolderId;
      }

      const created = await createDeck(d.name, mappedFolderId, d.icon || "🎴", d.description || "");
      deckIdMap.set(d.id, created.id);
      importedDecks++;
    }

    // Re-create flashcards
    let importedCards = 0;
    for (const c of rawCards) {
      let mappedDeckId: string | null = deckIdMap.get(c._deck_temp_id || c.deck_id) || null;
      if (!mappedDeckId && deckIdMap.size === 1) {
        mappedDeckId = Array.from(deckIdMap.values())[0];
      }

      if (mappedDeckId) {
        await createFlashcard(
          mappedDeckId,
          c.front || "(Blank)",
          c.back || "(Blank)",
          c.tags || "",
          c.image_url || null,
          c.front_image_url || null,
          c.back_image_url || null
        );
        importedCards++;
      }
    }

    return `Imported Folder package containing ${folderIdMap.size} folder(s), ${importedDecks} deck(s), and ${importedCards} card(s)!`;
  }

  // 3. IMPORT SUBJECT PACKAGE
  if (packageType === "subject") {
    const subjMeta = data.subject || {};
    const subjName = subjMeta.name || "Imported Subject";
    const newSubject = await createSubject(subjName, subjMeta.icon || "📚", subjMeta.color || "#6366f1");

    const rawFolders: Folder[] = data.folders || [];
    const rawDecks: Deck[] = data.decks || [];
    const rawCards: any[] = data.flashcards || [];

    const folderIdMap = new Map<string, string>();
    const deckIdMap = new Map<string, string>();

    // Pass 1: Create all folders under newSubject.id with parent = null
    for (const f of rawFolders) {
      const created = await createFolder(f.name, f.icon || "📁", f.color || "#6366f1", newSubject.id, null);
      folderIdMap.set(f.id, created.id);
    }

    // Pass 2: Connect parent subfolders
    for (const f of rawFolders) {
      const newFolderId = folderIdMap.get(f.id);
      if (!newFolderId) continue;
      if (f.parent_folder_id && folderIdMap.has(f.parent_folder_id)) {
        const mappedParentId = folderIdMap.get(f.parent_folder_id)!;
        await updateFolder(newFolderId, f.name, f.icon || "📁", f.color || "#6366f1", newSubject.id, mappedParentId);
      }
    }

    // Re-create decks
    let importedDecks = 0;
    for (const d of rawDecks) {
      const mappedFolderId = d.folder_id ? folderIdMap.get(d.folder_id) || null : null;
      const created = await createDeck(d.name, mappedFolderId, d.icon || "🎴", d.description || "");
      deckIdMap.set(d.id, created.id);
      importedDecks++;
    }

    // Re-create cards
    let importedCards = 0;
    for (const c of rawCards) {
      let mappedDeckId: string | null = deckIdMap.get(c._deck_temp_id || c.deck_id) || null;
      if (!mappedDeckId && deckIdMap.size === 1) {
        mappedDeckId = Array.from(deckIdMap.values())[0];
      }

      if (mappedDeckId) {
        await createFlashcard(
          mappedDeckId,
          c.front || "(Blank)",
          c.back || "(Blank)",
          c.tags || "",
          c.image_url || null,
          c.front_image_url || null,
          c.back_image_url || null
        );
        importedCards++;
      }
    }

    return `Imported Subject "${newSubject.name}" containing ${folderIdMap.size} folder(s), ${importedDecks} deck(s), and ${importedCards} card(s)!`;
  }

  throw new Error("Unsupported package type.");
}
