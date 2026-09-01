use std::collections::{HashMap, HashSet};
use crate::sync::models::{
    Deck, Flashcard, Folder, RevisionHistory, Subject, SyncPackage, Test, TestAnalysis, TestError,
    TestQuestion, Tombstone,
};

/// Deterministically merges local and remote sync packages in native Rust.
pub fn merge_sync_packages(local: SyncPackage, remote: SyncPackage) -> SyncPackage {
    // 0. Build Tombstones Set (deletions propagate bidirectionally)
    let mut tombstone_map: HashMap<String, Tombstone> = HashMap::new();
    for t in &remote.tombstones {
        tombstone_map.insert(t.entity_id.clone(), t.clone());
    }
    for t in &local.tombstones {
        tombstone_map.insert(t.entity_id.clone(), t.clone());
    }

    let is_deleted = |id: &str| tombstone_map.contains_key(id);

    // 1. Subjects Merge (Union by ID, filtering tombstones)
    let mut subject_map: HashMap<String, Subject> = HashMap::new();
    for s in remote.subjects {
        if !is_deleted(&s.id) {
            subject_map.insert(s.id.clone(), s);
        }
    }
    for s in local.subjects {
        if !is_deleted(&s.id) {
            if let Some(existing) = subject_map.get(&s.id) {
                // If both exist, choose newer updated_at (or fallback to local)
                let rem_updated = existing.updated_at.as_deref().unwrap_or(&existing.created_at);
                let loc_updated = s.updated_at.as_deref().unwrap_or(&s.created_at);
                if loc_updated >= rem_updated {
                    subject_map.insert(s.id.clone(), s);
                }
            } else {
                subject_map.insert(s.id.clone(), s);
            }
        }
    }

    // 2. Folders Merge (Union by ID, filtering tombstones)
    let mut folder_map: HashMap<String, Folder> = HashMap::new();
    for f in remote.folders {
        if !is_deleted(&f.id) {
            folder_map.insert(f.id.clone(), f);
        }
    }
    for f in local.folders {
        if !is_deleted(&f.id) {
            if let Some(existing) = folder_map.get(&f.id) {
                let rem_updated = existing.updated_at.as_deref().unwrap_or(&existing.created_at);
                let loc_updated = f.updated_at.as_deref().unwrap_or(&f.created_at);
                if loc_updated >= rem_updated {
                    folder_map.insert(f.id.clone(), f);
                }
            } else {
                folder_map.insert(f.id.clone(), f);
            }
        }
    }

    // 3. Decks Merge (Union by ID, filtering tombstones)
    let mut deck_map: HashMap<String, Deck> = HashMap::new();
    for d in remote.decks {
        if !is_deleted(&d.id) {
            deck_map.insert(d.id.clone(), d);
        }
    }
    for d in local.decks {
        if !is_deleted(&d.id) {
            if let Some(existing) = deck_map.get(&d.id) {
                let rem_updated = existing.updated_at.as_deref().unwrap_or(&existing.created_at);
                let loc_updated = d.updated_at.as_deref().unwrap_or(&d.created_at);
                if loc_updated >= rem_updated {
                    deck_map.insert(d.id.clone(), d);
                }
            } else {
                deck_map.insert(d.id.clone(), d);
            }
        }
    }

    // 4. Flashcards Merge (Intelligent FSRS conflict resolution + Content timestamping)
    let mut card_map: HashMap<String, Flashcard> = HashMap::new();
    let mut all_card_ids: HashSet<String> = HashSet::new();

    let local_card_map: HashMap<String, Flashcard> = local
        .flashcards
        .into_iter()
        .map(|c| (c.id.clone(), c))
        .collect();

    let remote_card_map: HashMap<String, Flashcard> = remote
        .flashcards
        .into_iter()
        .map(|c| (c.id.clone(), c))
        .collect();

    for id in local_card_map.keys().chain(remote_card_map.keys()) {
        all_card_ids.insert(id.clone());
    }

    for id in all_card_ids {
        if is_deleted(&id) {
            continue;
        }

        let loc_opt = local_card_map.get(&id);
        let rem_opt = remote_card_map.get(&id);

        match (loc_opt, rem_opt) {
            (Some(loc), None) => {
                card_map.insert(id, loc.clone());
            }
            (None, Some(rem)) => {
                card_map.insert(id, rem.clone());
            }
            (Some(loc), Some(rem)) => {
                // Both exist: resolve FSRS review state vs content updates
                let loc_last_rev = loc.last_review.as_deref().unwrap_or("");
                let rem_last_rev = rem.last_review.as_deref().unwrap_or("");
                let loc_reps = loc.reps.unwrap_or(0);
                let rem_reps = rem.reps.unwrap_or(0);

                let prefer_remote_fsrs = rem_last_rev > loc_last_rev
                    || (rem_last_rev == loc_last_rev && rem_reps > loc_reps);

                let fsrs_source = if prefer_remote_fsrs { rem } else { loc };

                let loc_updated = loc.updated_at.as_deref().unwrap_or(&loc.created_at);
                let rem_updated = rem.updated_at.as_deref().unwrap_or(&rem.created_at);
                let content_source = if rem_updated > loc_updated { rem } else { loc };

                card_map.insert(
                    id.clone(),
                    Flashcard {
                        id: id.clone(),
                        deck_id: content_source.deck_id.clone(),
                        front: content_source.front.clone(),
                        back: content_source.back.clone(),
                        tags: content_source.tags.clone(),
                        ease: fsrs_source.ease.or(loc.ease),
                        interval_days: fsrs_source.interval_days.or(loc.interval_days),
                        repetitions: fsrs_source.repetitions.or(loc.repetitions),
                        next_review: fsrs_source.next_review.clone(),
                        created_at: loc.created_at.clone(),
                        stability: fsrs_source.stability.or(loc.stability),
                        difficulty: fsrs_source.difficulty.or(loc.difficulty),
                        state: fsrs_source.state.or(loc.state),
                        reps: fsrs_source.reps.or(loc.reps),
                        lapses: fsrs_source.lapses.or(loc.lapses),
                        elapsed_days: fsrs_source.elapsed_days.or(loc.elapsed_days),
                        scheduled_days: fsrs_source.scheduled_days.or(loc.scheduled_days),
                        last_review: fsrs_source.last_review.clone().or(loc.last_review.clone()),
                        image_url: content_source.image_url.clone().or(loc.image_url.clone()),
                        front_image_url: content_source.front_image_url.clone().or(loc.front_image_url.clone()),
                        back_image_url: content_source.back_image_url.clone().or(loc.back_image_url.clone()),
                        updated_at: Some(std::cmp::max(loc_updated, rem_updated).to_string()),
                    },
                );
            }
            (None, None) => {}
        }
    }

    // 5. Revision History (Immutable logs, union by ID)
    let mut history_map: HashMap<String, RevisionHistory> = HashMap::new();
    for h in remote.revision_history {
        history_map.insert(h.id.clone(), h);
    }
    for h in local.revision_history {
        history_map.insert(h.id.clone(), h);
    }

    // 6. Tests & Questions Merge
    let mut test_map: HashMap<String, Test> = HashMap::new();
    for t in remote.tests {
        if !is_deleted(&t.id) {
            test_map.insert(t.id.clone(), t);
        }
    }
    for t in local.tests {
        if !is_deleted(&t.id) {
            if let Some(existing) = test_map.get(&t.id) {
                let rem_updated = existing.updated_at.as_deref().unwrap_or(&existing.created_at);
                let loc_updated = t.updated_at.as_deref().unwrap_or(&t.created_at);
                if loc_updated >= rem_updated {
                    test_map.insert(t.id.clone(), t);
                }
            } else {
                test_map.insert(t.id.clone(), t);
            }
        }
    }

    let mut question_map: HashMap<String, TestQuestion> = HashMap::new();
    for q in remote.test_questions {
        if !is_deleted(&q.id) {
            question_map.insert(q.id.clone(), q);
        }
    }
    for q in local.test_questions {
        if !is_deleted(&q.id) {
            question_map.insert(q.id.clone(), q);
        }
    }

    let mut analysis_map: HashMap<String, TestAnalysis> = HashMap::new();
    for a in remote.test_analyses {
        analysis_map.insert(a.id.clone(), a);
    }
    for a in local.test_analyses {
        analysis_map.insert(a.id.clone(), a);
    }

    let mut error_map: HashMap<String, TestError> = HashMap::new();
    for e in remote.test_errors {
        error_map.insert(e.id.clone(), e);
    }
    for e in local.test_errors {
        error_map.insert(e.id.clone(), e);
    }

    SyncPackage {
        version: "1.0".to_string(),
        exported_at: chrono_now_iso(),
        client_id: local.client_id,
        device_name: local.device_name,
        schema_version: 14,
        subjects: subject_map.into_values().collect(),
        folders: folder_map.into_values().collect(),
        decks: deck_map.into_values().collect(),
        flashcards: card_map.into_values().collect(),
        revision_history: history_map.into_values().collect(),
        tests: test_map.into_values().collect(),
        test_questions: question_map.into_values().collect(),
        test_analyses: analysis_map.into_values().collect(),
        test_errors: error_map.into_values().collect(),
        fsrs_parameters: remote.fsrs_parameters.or(local.fsrs_parameters),
        notification_settings: local.notification_settings.or(remote.notification_settings),
        tombstones: tombstone_map.into_values().collect(),
    }
}

pub fn chrono_now_iso() -> String {
    // Generate ISO8601 string without external dependency
    let now = std::time::SystemTime::now();
    let duration = now
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    let millis = duration.subsec_millis();

    // Approximate ISO string or formatted timestamp
    format!("{}.{:03}Z", secs, millis)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::models::{Flashcard, SyncPackage, Tombstone};

    fn dummy_package() -> SyncPackage {
        SyncPackage {
            version: "1.0".to_string(),
            exported_at: "2026-09-01T00:00:00Z".to_string(),
            client_id: "test_client".to_string(),
            device_name: "Test Device".to_string(),
            schema_version: 14,
            subjects: vec![],
            folders: vec![],
            decks: vec![],
            flashcards: vec![],
            revision_history: vec![],
            tests: vec![],
            test_questions: vec![],
            test_analyses: vec![],
            test_errors: vec![],
            fsrs_parameters: None,
            notification_settings: None,
            tombstones: vec![],
        }
    }

    #[test]
    fn test_merge_prefers_newer_fsrs_review() {
        let mut local = dummy_package();
        let mut remote = dummy_package();

        let card_local = Flashcard {
            id: "card_1".to_string(),
            deck_id: "deck_1".to_string(),
            front: "Question 1".to_string(),
            back: "Answer 1".to_string(),
            tags: None,
            ease: Some(2.5),
            interval_days: Some(3),
            repetitions: Some(1),
            next_review: "2026-09-04T00:00:00Z".to_string(),
            created_at: "2026-09-01T00:00:00Z".to_string(),
            stability: Some(3.0),
            difficulty: Some(5.0),
            state: Some(2),
            reps: Some(1),
            lapses: Some(0),
            elapsed_days: Some(1),
            scheduled_days: Some(3),
            last_review: Some("2026-09-01T10:00:00Z".to_string()),
            image_url: None,
            front_image_url: None,
            back_image_url: None,
            updated_at: Some("2026-09-01T10:00:00Z".to_string()),
        };

        let mut card_remote = card_local.clone();
        card_remote.last_review = Some("2026-09-01T12:00:00Z".to_string());
        card_remote.reps = Some(2);
        card_remote.interval_days = Some(7);
        card_remote.stability = Some(7.0);

        local.flashcards.push(card_local);
        remote.flashcards.push(card_remote);

        let merged = merge_sync_packages(local, remote);
        assert_eq!(merged.flashcards.len(), 1);
        let merged_card = &merged.flashcards[0];
        assert_eq!(merged_card.reps, Some(2));
        assert_eq!(merged_card.stability, Some(7.0));
        assert_eq!(merged_card.last_review.as_deref(), Some("2026-09-01T12:00:00Z"));
    }

    #[test]
    fn test_merge_propagates_tombstones() {
        let mut local = dummy_package();
        let mut remote = dummy_package();

        let card = Flashcard {
            id: "card_to_delete".to_string(),
            deck_id: "deck_1".to_string(),
            front: "Q".to_string(),
            back: "A".to_string(),
            tags: None,
            ease: None,
            interval_days: None,
            repetitions: None,
            next_review: "".to_string(),
            created_at: "".to_string(),
            stability: None,
            difficulty: None,
            state: None,
            reps: None,
            lapses: None,
            elapsed_days: None,
            scheduled_days: None,
            last_review: None,
            image_url: None,
            front_image_url: None,
            back_image_url: None,
            updated_at: None,
        };

        remote.flashcards.push(card);
        local.tombstones.push(Tombstone {
            entity_id: "card_to_delete".to_string(),
            entity_type: "flashcard".to_string(),
            deleted_at: "2026-09-01T11:00:00Z".to_string(),
        });

        let merged = merge_sync_packages(local, remote);
        assert_eq!(merged.flashcards.len(), 0);
        assert_eq!(merged.tombstones.len(), 1);
    }
}

