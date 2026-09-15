"use client";

import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

export default function Home() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTasks = async () => {
      const { data, error } = await supabase
        .from("user_tasks")
        .select("*");

      if (error) {
        setError(error.message);
      } else {
        setTasks(data || []);
      }
      setLoading(false);
    };

    loadTasks();
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: "monospace", background: "#0f172a", color: "#e2e8f0", minHeight: "100vh" }}>
      <h1 style={{ color: "#06b6d4" }}>🔌 Supabase Connection Test</h1>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>❌ Error: {error}</p>}
      {!loading && !error && (
        <>
          <p style={{ color: "#22c55e" }}>✅ Connected! Found {tasks.length} tasks</p>
          <ul>
            {tasks.slice(0, 8).map((t) => (
              <li key={t.id}>
                <strong>{t.user_name}</strong> ({t.user_role}) → {t.manifest_group_id} [{t.status}]
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}