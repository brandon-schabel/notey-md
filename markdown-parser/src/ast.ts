// Union type for all Markdown nodes
export type MarkdownNode =
  | DocumentNode
  | ParagraphNode
  | HeadingNode
  | BlockquoteNode
  | ListNode
  | ListItemNode
  | CodeBlockNode
  | ThematicBreakNode
  | HtmlBlockNode
  | TextNode
  | EmphasisNode
  | StrongNode
  | CodeSpanNode
  | LinkNode
  | ImageNode
  | LineBreakNode
  | RawHtmlNode;

// AST Node Definitions

export interface DocumentNode {
  type: 'document';
  children: MarkdownNode[];
  refDefinitions: Map<string, RefDefinition>;
}

export interface ParagraphNode {
  type: 'paragraph';
  children: MarkdownNode[];
  // Optionally, store raw text prior to inline parsing
  _raw?: string;
}

export interface HeadingNode {
  type: 'heading';
  level: number;
  children: MarkdownNode[];
}

export interface BlockquoteNode {
  type: 'blockquote';
  children: MarkdownNode[];
}

export interface ListNode {
  type: 'list';
  ordered: boolean;
  start: number | null;
  tight: boolean;
  children: ListItemNode[];
}

export interface ListItemNode {
  type: 'list_item';
  children: MarkdownNode[];
  spread?: boolean; // for loose/tight determination
}

export interface CodeBlockNode {
  type: 'code_block';
  language?: string;
  value: string;
  fence?: string; // fence marker for later checks
}

export interface ThematicBreakNode {
  type: 'thematic_break';
}

export interface HtmlBlockNode {
  type: 'html_block';
  value: string;
}

export interface TextNode {
  type: 'text';
  value: string;
}

export interface EmphasisNode {
  type: 'emphasis';
  children: MarkdownNode[];
}

export interface StrongNode {
  type: 'strong';
  children: MarkdownNode[];
}

export interface CodeSpanNode {
  type: 'code_span';
  code: string;
}

export interface LinkNode {
  type: 'link';
  url: string;
  title?: string;
  children: MarkdownNode[];
}

export interface ImageNode {
  type: 'image';
  url: string;
  title?: string;
  alt: string;
}

export interface LineBreakNode {
  type: 'linebreak';
}

export interface RawHtmlNode {
  type: 'raw_html';
  content: string;
}

// Reference definition for links
export interface RefDefinition {
  label: string;
  url: string;
  title?: string;
}

