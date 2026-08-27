import React from "react";
import { Bot, Sparkles, Bell, BrainCircuit, Database, Cloud } from "lucide-react";

export type SettingsTabId = 'ai' | 'personas' | 'notifications' | 'fsrs' | 'sync' | 'data';

export interface SettingsTabConfig {
  id: SettingsTabId;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  description: string;
  badge?: string;
  keywords: string[];
}

export const SETTINGS_TABS: SettingsTabConfig[] = [
  {
    id: 'ai',
    label: 'AI & Models',
    icon: Bot,
    description: 'Manage API keys, model parameters, and task-specific AI routing',
    keywords: ['gemini', 'groq', 'local', 'llm', 'api key', 'model', 'scan', 'validate', 'quiz', 'routing']
  },
  {
    id: 'personas',
    label: 'Teaching Personas',
    icon: BrainCircuit,
    description: 'Customize conversational learning personalities and tutor personas',
    keywords: ['persona', 'teaching', 'personality', 'tutor', 'prompt', 'child', 'socratic']
  },
  {
    id: 'notifications',
    label: 'Notifications & Study',
    icon: Bell,
    description: 'Configure daily study reminders, streak rest days, and quiet hours',
    keywords: ['notification', 'reminder', 'schedule', 'streak', 'rest days', 'quiet hours', 'sound', 'toast', 'dnd']
  },
  {
    id: 'fsrs',
    label: 'Spaced Repetition (FSRS)',
    icon: Sparkles,
    description: 'View memory scheduler parameters and run optimization routines',
    keywords: ['fsrs', 'algorithm', 'spaced repetition', 'optimize', 'parameters', 'retention', 'scheduler']
  },
  {
    id: 'sync',
    label: 'Cloud & WebDAV Sync',
    icon: Cloud,
    description: 'Sync flashcards, decks, FSRS progress, and history across devices via WebDAV',
    keywords: ['webdav', 'sync', 'cloud', 'nextcloud', 'owncloud', 'fastmail', 'backup', 'remote', 'synology']
  },
  {
    id: 'data',
    label: 'Data & Maintenance',
    icon: Database,
    description: 'Manage local database storage, backups, and app maintenance',
    keywords: ['database', 'reset', 'wipe', 'storage', 'backup', 'danger']
  }
];
