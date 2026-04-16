export type DocumentId = string;

export interface DocumentRecord {
  _id: DocumentId;
  title: string;
  isArchived: boolean;
  parentDocument?: DocumentId;
  content?: string;
  coverImage?: string;
  icon?: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DocumentUpdateInput = Partial<
  Pick<DocumentRecord, "title" | "content" | "coverImage" | "icon" | "isPublished">
>;
