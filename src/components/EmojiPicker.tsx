import { useState, useRef, useEffect } from "react";

interface EmojiPickerProps {
  value: string;
  onChange: (val: string) => void;
  label?: string;
}

const EMOJI_CATEGORIES = [
  {
    name: "Study",
    emojis: ["📚", "🧠", "🧪", "🔬", "🧬", "🪐", "💻", "🎨", "🏛️", "📜", "🔢", "🎒", "💡", "🎯", "🏆", "🌟", "🧩", "⚡", "📖", "✏️", "📐", "🧮", "🗣️", "📝"]
  },
  {
    name: "Smileys",
    emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😜", "🤪", "😎", "🤓", "🧐", "🥳", "🤔"]
  },
  {
    name: "Nature",
    emojis: ["🐱", "🐶", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐰", "🐵", "🦅", "🦉", "🦕", "🐝", "🌸", "🍀", "🍁", "🍄", "🌎", "🌍", "🌏", "🌙", "☀️", "🔥"]
  },
  {
    name: "Activity",
    emojis: ["⚽", "🏀", "🏈", "🎾", "🎮", "🎲", "🧩", "🎸", "🎺", "🎨", "🎬", "🍿", "🍕", "🍔", "🍟", "🍣", "🌮", "🍎", "🍓", "☕", "🥤", "🍩", "🍪"]
  },
  {
    name: "Objects",
    emojis: ["🎴", "📁", "📂", "🗃️", "📦", "✉️", "🏷️", "🔑", "⚙️", "🛠️", "⏰", "📅", "🔒", "📢", "🎵", "❤️", "🔔", "⭐", "💎", "🔋", "🩹", "🗺️", "🛸", "🚀"]
  },
  {
    name: "Flags",
    emojis: ["🇺🇸", "🇬🇧", "🇪🇸", "🇫🇷", "🇩🇪", "🇯🇵", "🇮🇹", "🇨🇦", "🇨🇳", "🇰🇷", "🇧🇷", "🇲🇽", "🇦🇺", "🇮🇳", "🏁", "🚩"]
  }
];

const EMOJI_KEYWORDS: Record<string, string[]> = {
  "book": ["📚", "📖", "📜"],
  "read": ["📚", "📖", "📜"],
  "study": ["📚", "🎒", "📝", "✏️", "📐", "🧮"],
  "brain": ["🧠"],
  "think": ["🧠", "🤔"],
  "science": ["🧪", "🔬", "🧬", "🪐"],
  "chemistry": ["🧪"],
  "bio": ["🧬", "🔬"],
  "computer": ["💻"],
  "art": ["🎨"],
  "music": ["🎸", "🎺", "🎵"],
  "game": ["🎮", "🎲", "🧩"],
  "play": ["🎮", "🎲", "🧩", "⚽", "🏀", "🏈", "🎾"],
  "sports": ["⚽", "🏀", "🏈", "🎾"],
  "star": ["⭐", "🌟"],
  "trophy": ["🏆"],
  "win": ["🏆", "🎯"],
  "flag": ["🇺🇸", "🇬🇧", "🇪🇸", "🇫🇷", "🇩🇪", "🇯🇵", "🇮🇹", "🇨🇦", "🇨🇳", "🇰🇷", "🇧🇷", "🇲🇽", "🇦🇺", "🇮🇳", "🏁", "🚩"],
  "folder": ["📁", "📂", "🗃️"],
  "box": ["📦"],
  "idea": ["💡"],
  "light": ["💡"],
  "time": ["⏰", "📅"],
  "cat": ["🐱"],
  "dog": ["🐶"],
  "nature": ["🌸", "🍀", "🍁", "🍄", "🌎", "🌍", "🌏"],
  "smile": ["😀", "😃", "😄", "😁", "😆", "😊"]
};

export default function CustomEmojiPicker({ value, onChange, label = "Icon Emoji" }: EmojiPickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [activeTab, setActiveTab] = useState("Study");
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleEmojiClick = (emoji: string) => {
    onChange(emoji);
    setShowPicker(false);
  };

  const getFilteredEmojis = () => {
    if (!searchQuery.trim()) {
      const tab = EMOJI_CATEGORIES.find(c => c.name === activeTab);
      return tab ? tab.emojis : [];
    }
    const query = searchQuery.toLowerCase().trim();
    const matched: string[] = [];
    Object.keys(EMOJI_KEYWORDS).forEach(key => {
      if (key.includes(query)) {
        matched.push(...EMOJI_KEYWORDS[key]);
      }
    });
    const uniqueMatched = Array.from(new Set(matched));
    if (uniqueMatched.length > 0) return uniqueMatched;
    const matchedCategory = EMOJI_CATEGORIES.find(c => c.name.toLowerCase().includes(query));
    if (matchedCategory) return matchedCategory.emojis;
    return [];
  };

  const displayEmojis = getFilteredEmojis();

  return (
    <div className="notion-input-group" ref={containerRef} style={{ position: "relative" }}>
      <label>{label}</label>
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          style={{
            fontSize: "2rem",
            width: "56px",
            height: "56px",
            borderRadius: "8px",
            border: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "var(--box-shadow-sm)",
            transition: "background-color 0.2s"
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--bg-hover)"}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "var(--bg-secondary)"}
          title="Click to select emoji"
        >
          {value || "🎴"}
        </button>
        
        <input 
          className="notion-input"
          type="text" 
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. 🧪"
          maxLength={4}
          style={{ width: "120px", fontSize: "1rem", height: "40px" }}
        />
        
        <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
          Click the icon to browse all emojis
        </span>
      </div>

      {showPicker && (
        <div 
          style={{ 
            marginTop: "10px",
            width: "100%",
            zIndex: 10, 
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            borderRadius: "10px",
            border: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-secondary)",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "10px"
          }}
        >
          <input
            type="text"
            className="notion-input"
            placeholder="Search emojis (e.g. study, science, cat, art)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ fontSize: "0.88rem", padding: "6px 10px" }}
          />

          {!searchQuery && (
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", borderBottom: "1px solid var(--border-color)", paddingBottom: "6px" }}>
              {EMOJI_CATEGORIES.map(cat => (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setActiveTab(cat.name)}
                  style={{
                    padding: "4px 8px",
                    fontSize: "0.78rem",
                    borderRadius: "4px",
                    border: "none",
                    cursor: "pointer",
                    backgroundColor: activeTab === cat.name ? "var(--accent-color)" : "transparent",
                    color: activeTab === cat.name ? "#ffffff" : "var(--text-secondary)",
                    fontWeight: activeTab === cat.name ? 600 : 500
                  }}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}

          <div 
            style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fill, minmax(36px, 1fr))", 
              gap: "6px", 
              maxHeight: "180px", 
              overflowY: "auto",
              padding: "4px"
            }}
          >
            {displayEmojis.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleEmojiClick(emoji)}
                style={{
                  fontSize: "1.5rem",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background-color 0.15s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--bg-hover)"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
              >
                {emoji}
              </button>
            ))}
            {displayEmojis.length === 0 && (
              <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "20px", fontSize: "0.85rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                No matching emojis found.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
