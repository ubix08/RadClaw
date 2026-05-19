export type AgentRole = "orchestrator" | "builder" | "writer" | "analyst"

export type AgentConfig = {
  name: string
  role: AgentRole
  model?: string
  systemPrompt: string
  agentType: "orchestrator" | "worker"
}

export type TeamConfig = {
  agents: AgentConfig[]
}

export type TaskStatus = "pending" | "in_progress" | "completed" | "failed"

export type TaskRecord = {
  id: string
  agentName: string
  title: string
  parentTaskId: string | null
  status: TaskStatus
  assignedAt: number
  completedAt: number | null
  outputPath: string | null
  summary: string | null
}

export type StreamPart =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_use"; name: string; input: unknown; id?: string }
  | { type: "tool_result"; text: string; tool_use_id?: string }
  | { type: "error"; message: string }
