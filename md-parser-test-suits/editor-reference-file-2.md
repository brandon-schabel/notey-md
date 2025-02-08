```markdown
# Comprehensive Markdown Document for Testing

This document contains a wide range of Markdown features to help validate your Markdown to HTML parser.

---

## 1. Headings

# Heading Level 1
## Heading Level 2
### Heading Level 3
#### Heading Level 4
##### Heading Level 5
###### Heading Level 6

---

## 2. Paragraphs

This is a simple paragraph with some text. Markdown supports multiple paragraphs separated by blank lines.

Here is another paragraph to illustrate spacing.

---

## 3. Emphasis

*Italic text using asterisks*  
_Italic text using underscores_

**Bold text using asterisks**  
__Bold text using underscores__

***Bold and italic text using asterisks***  
___Bold and italic text using underscores___

---

## 4. Blockquotes

> This is a blockquote.
>
> It can span multiple paragraphs and include other Markdown elements such as lists:
> - List item one
> - List item two

Nested blockquote:
> > This is a nested blockquote level 2.
> >
> > > This is nested blockquote level 3.

---

## 5. Lists

### 5.1. Unordered Lists

- Item 1
- Item 2
  - Nested Item 2.1
  - Nested Item 2.2
- Item 3

### 5.2. Ordered Lists

1. First item
2. Second item
   1. Nested ordered item 2.1
   2. Nested ordered item 2.2
3. Third item

### 5.3. Task Lists (GitHub Flavored Markdown)

- [x] Completed task
- [ ] Incomplete task
- [ ] Another incomplete task

---

## 6. Code

### 6.1. Inline Code

This is an example of inline code: `console.log("Hello, world!")`.

### 6.2. Code Blocks

Fenced code block with a language specifier:

```javascript
function greet(name) {
    console.log(`Hello, ${name}!`);
}
greet("Markdown");
```

Indented code block:

    def greet(name):
        print("Hello, " + name)
    greet("Markdown")

---

## 7. Horizontal Rules

Using dashes:

---

Using underscores:

___

Using asterisks:

***

---

## 8. Links

Inline link: [Markdown Guide](https://www.markdownguide.org/)

Link with title: [GitHub](https://github.com "GitHub Homepage")

Automatic link: <https://www.example.com>

---

## 9. Images

Inline image:

![Alt text for image](https://via.placeholder.com/150 "Optional title")

Reference-style image:

![Reference Image][image-ref]

[image-ref]: https://via.placeholder.com/200 "Reference Image Title"

---

## 10. Tables

| Header 1 | Header 2 | Header 3 |
|----------|:--------:|---------:|
| Left     | Center   | Right    |
| Data 1   | Data 2   | Data 3   |
| Data 4   | Data 5   | Data 6   |

---

## 11. Footnotes

Here is a statement with a footnote.[^1]

Another reference to a longer footnote.[^longnote]

[^1]: This is a simple footnote.

[^longnote]: This is a footnote with multiple lines.
    You can continue the explanation here.

---

## 12. Strikethrough (GitHub Flavored Markdown)

This is ~~strikethrough~~ text.

---

## 13. Definition Lists (if supported)

Term 1  
: Definition for term 1

Term 2  
: Definition for term 2

---

## 14. Inline HTML

<div style="color: red; padding: 10px; border: 1px solid #ccc;">
  This is inline HTML content.
</div>

<script>
  // Inline JavaScript for testing purposes
  console.log('Hello from inline HTML!');
</script>

---

## 15. Emoji

I :heart: Markdown! :smile:

---

## 16. Escaping Characters

Escape special characters using a backslash: \*this is not italic\* and \# not a heading.

---

## 17. Math (LaTeX)

Inline math: $E = mc^2$

Display math:

$$
\int_{a}^{b} f(x)\,dx = F(b) - F(a)
$$

---

## 18. Details and Summary

<details>
  <summary>Click to expand hidden content</summary>
  
  This section is hidden by default. It can include multiple paragraphs, lists, and even code blocks.
  
- Hidden list item 1
- Hidden list item 2
  
  ```python
  # This code is inside the details element
  print("Hello from details!")
  ```
  
</details>

---

## 19. Miscellaneous

> **Note:** This document is designed to test a wide range of Markdown features, including some that may only be supported in extended Markdown implementations.

For further reference, check out the [CommonMark Spec](https://spec.commonmark.org/).

_End of Document._

```
