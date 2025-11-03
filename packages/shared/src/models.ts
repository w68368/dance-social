export type UserId = string;

export interface DancerProfile {
  id: UserId;
  displayName: string;
  city?: string;
  styles: string[]; // hip-hop, heels, contemporary...
  avatarUrl?: string;
  bio?: string;
  rating?: number; // rait dancer
}

export interface Team {
  id: string;
  name: string;
  city?: string;
  members: UserId[];
}

export interface VideoPost {
  id: string;
  authorId: UserId;
  videoUrl: string;
  title?: string;
  description?: string;
  likes: number;
  createdAt: string;
}
