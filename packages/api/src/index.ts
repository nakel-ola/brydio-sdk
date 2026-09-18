import { defaultBridge, type ApiAction, type ApiGrant } from '@brydio/app';

export interface ProjectSummary {
  id: string;
  name: string;
  role: 'viewer' | 'editor' | 'owner';
  chatCount: number;
  createdAt: string;
  lastActiveAt: string;
  pinnedAt?: string;
  [field: string]: unknown;
}

export interface ProjectDetail extends ProjectSummary {
  instructions: string;
}

export interface FileSummary {
  id: string;
  name: string;
  kind: string;
  status: string;
  mimeType?: string;
  size?: number;
  createdAt: string;
  [field: string]: unknown;
}

export interface FileContent extends FileSummary {
  base64: string;
}

export interface FileInput {
  name: string;
  /** The file bytes encoded as base64. */
  base64: string;
  mimeType?: string;
}

export interface ChatSummary {
  id: string;
  question: string;
  messageCount: number;
  startedAt: string;
  title?: string;
  projectId?: string;
  [field: string]: unknown;
}

export interface ChatDetail extends ChatSummary {
  turns: { role: 'user' | 'assistant'; content: string; at?: string }[];
}

export interface ConnectionResponse<T = unknown> {
  status: number;
  body: T;
}

type Input = Record<string, unknown>;

const call = <T>(action: ApiAction, input: Input, grant: ApiGrant): Promise<T> =>
  defaultBridge().callApi<T>(action, input, grant);

export const api = {
  projects: {
    list(options: { query?: string } = {}): Promise<ProjectSummary[]> {
      return call('projects.list', options, 'projects');
    },
    get(id: string): Promise<ProjectDetail> {
      return call('projects.get', { id }, 'projects');
    },
    create(input: { name: string; instructions?: string }): Promise<ProjectDetail> {
      return call('projects.create', input, 'projects');
    },
    update(id: string, changes: { name?: string; instructions?: string; pinned?: boolean }): Promise<ProjectDetail> {
      return call('projects.update', { id, changes }, 'projects');
    },
    remove(id: string, options: { withChats?: boolean } = {}): Promise<{ chatsMoved: number; chatsDeleted: number }> {
      return call('projects.remove', { id, ...(options.withChats === undefined ? {} : { withChats: options.withChats }) }, 'projects');
    },
    archiveChats(id: string): Promise<{ archived: number }> {
      return call('projects.archiveChats', { id }, 'projects');
    },
  },
  files: {
    list(projectId: string): Promise<FileSummary[]> {
      return call('files.list', { projectId }, 'files');
    },
    read(id: string): Promise<FileContent> {
      return call('files.read', { id }, 'files');
    },
    upload(projectId: string, file: FileInput): Promise<FileSummary> {
      return call('files.upload', { projectId, file }, 'files');
    },
    addFromConnection(
      projectId: string,
      input: { connection: string; link?: string; driveId?: string; itemId?: string },
    ): Promise<FileSummary> {
      return call('files.addFromConnection', { projectId, ...input }, 'files');
    },
    replace(id: string, file: FileInput): Promise<FileSummary> {
      return call('files.replace', { id, file }, 'files');
    },
    remove(id: string): Promise<{ removed: true }> {
      return call('files.remove', { id }, 'files');
    },
  },
  chats: {
    list(options: { projectId?: string; archived?: boolean } = {}): Promise<ChatSummary[]> {
      return call('chats.list', options, 'chats');
    },
    get(id: string): Promise<ChatDetail> {
      return call('chats.get', { id }, 'chats');
    },
    create(input: { title: string; assistantId?: string; projectId?: string }): Promise<{ id: string }> {
      return call('chats.create', input, 'chats');
    },
    update(
      id: string,
      changes: { title?: string; pinned?: boolean; archived?: boolean; projectId?: string | null },
    ): Promise<ChatSummary> {
      return call('chats.update', { id, changes }, 'chats');
    },
    send(id: string, input: { message: string; assistantId?: string }): Promise<{ conversationId: string; answer: string }> {
      return call('chats.send', { id, ...input }, 'chats');
    },
    remove(id: string): Promise<{ removed: true }> {
      return call('chats.remove', { id }, 'chats');
    },
  },
  connections: {
    use(name: string) {
      const grant = `connection:${name}` as const;

      return {
        request<T = unknown>(input: {
          path: string;
          method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
          query?: Record<string, string>;
          body?: unknown;
        }): Promise<ConnectionResponse<T>> {
          return call('connections.request', { connection: name, ...input }, grant);
        },
      };
    },
  },
} as const;
