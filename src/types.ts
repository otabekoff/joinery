export interface Column {
  id: string;
  name: string;
  type: string;
  pk: boolean;
  nullable: boolean;
  unique: boolean;
  def: string;
  autoInc?: boolean;
  comment?: string;
}

export interface IndexDef {
  id: string;
  name: string;
  cols: string[];
  unique: boolean;
}

export interface Table {
  id: string;
  name: string;
  x: number;
  y: number;
  cols: Column[];
  draft?: boolean;
  indexes?: IndexDef[];
  comment?: string;
}

export interface ColRef {
  t: string;
  c: string;
}

export const FK_ACTIONS = ["NO ACTION", "RESTRICT", "CASCADE", "SET NULL", "SET DEFAULT"] as const;
export type FkAction = (typeof FK_ACTIONS)[number];

export interface Rel {
  id: string;
  from: ColRef;
  to: ColRef;
  onDelete?: FkAction;
  onUpdate?: FkAction;
  // One-to-one: the foreign key column is unique. Otherwise many-to-one.
  one?: boolean;
}

export interface Note {
  id: string;
  x: number;
  y: number;
  text: string;
}

export interface EnumType {
  name: string;
  values: string[];
}

export interface Design {
  id: string;
  name: string;
  engine: string;
  tables: Table[];
  rels: Rel[];
  enums: EnumType[];
  notes?: Note[];
  modified: number;
}

export interface Project {
  id: string;
  name: string;
  // Folder the project file lives in; empty when running outside the desktop app.
  path: string;
  designs: Design[];
  modified: number;
  // How the designs list is ordered; "custom" is the order of `designs` itself.
  sort?: DesignSort;
  // Engine preselected for new designs in this project.
  engine?: string;
}

export type DesignSortKey = "custom" | "name" | "engine" | "tables" | "modified";
export interface DesignSort { key: DesignSortKey; desc: boolean }
export type ProjectSortKey = "name" | "designs" | "modified";
export interface ProjectSort { key: ProjectSortKey; desc: boolean }

export type Theme = "light" | "dark";
export type Mode = "wide" | "mid" | "compact";

export type View =
  | { name: "projects" }
  | { name: "project"; projectId: string; creating?: boolean }
  | { name: "editor"; projectId: string; designId: string };
