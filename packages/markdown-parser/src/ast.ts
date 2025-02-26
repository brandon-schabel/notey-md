export interface RefDefinition {
label: string
  url: string
  title?: string
}

type NodeBase<T extends string> = { type: T }
type NodeWithChildren<T extends string, U extends MarkdownNode[]> = NodeBase<T> & { children: U }
type NodeWithOptionalRaw<T extends string, U extends MarkdownNode[]> = NodeWithChildren<T, U> & { _raw?: string }
type NodeWithValue<T extends string> = NodeBase<T> & { value: string }
type NodeWithCode<T extends string> = NodeBase<T> & { code: string }

export type DocumentNode = NodeWithChildren<"document", MarkdownNode[]> & {
  refDefinitions: Map<string, RefDefinition>
}

export type ParagraphNode = NodeWithOptionalRaw<"paragraph", MarkdownNode[]>
export type HeadingNode = NodeWithChildren<"heading", MarkdownNode[]> & { level: number }
export type BlockquoteNode = NodeWithChildren<"blockquote", MarkdownNode[]>

// bulletChar is * - + for unordered lists
// delimiter is '.' or ')' for ordered lists
export type ListNode = NodeWithChildren<"list", ListItemNode[]> & {
  ordered: boolean
  start: number | null
  tight: boolean
  bulletChar?: string
  delimiter?: "." | ")"
}

export type ListItemNode = NodeWithChildren<"list_item", MarkdownNode[]> & { spread?: boolean }
export type CodeBlockNode = NodeBase<"code_block"> & {
  language?: string
  value: string
  fence?: string
}
export type ThematicBreakNode = NodeBase<"thematic_break">
export type HtmlBlockNode = NodeBase<"html_block"> & { value: string }
export type TextNode = NodeWithValue<"text">
export type EmphasisNode = NodeWithChildren<"emphasis", MarkdownNode[]>
export type StrongNode = NodeWithChildren<"strong", MarkdownNode[]>
export type CodeSpanNode = NodeWithCode<"code_span">
export type LinkNode = NodeWithChildren<"link", MarkdownNode[]> & { url: string; title?: string }
export type ImageNode = NodeBase<"image"> & { url: string; title?: string; alt: string }
export type LineBreakNode = NodeBase<"linebreak">
export type RawHtmlNode = NodeBase<"raw_html"> & { content: string }

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
  | RawHtmlNode

// Add InlineToken type
export type InlineToken =
    | { type: "text"; content: string }
    | { type: "code_span"; content: string }
    | { type: "raw_html"; content: string }
    | { type: "autolink"; content: string }
    | { type: "softbreak"; content: string }
    | { type: "br"; content: string }
    | { type: "delim"; content: string }
    | { type: "lbracket"; content: string }
    | { type: "rbracket"; content: string }
    | { type: "lparen"; content: string }
    | { type: "rparen"; content: string };