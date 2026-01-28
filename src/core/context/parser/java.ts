
export class JavaParser {
  /**
   * Extract all imported class names from the content.
   * Returns fully qualified names like 'com.example.User'.
   */
  static parseImports(content: string): string[] {
    const imports: string[] = []
    // Regex to match: import [static] com.example.Class;
    const regex = /import\s+(?:static\s+)?([\w.]+);/g
    let match
    while ((match = regex.exec(content)) !== null) {
      if (match[1]) {
        imports.push(match[1])
      }
    }
    return imports
  }

  /**
   * Generate a skeleton of the Java file.
   * Keeps package, imports, class definitions, and method signatures.
   * Hides method bodies with "// ... implementation hidden ...".
   * 
   * Heuristic:
   * - Class definitions are usually at depth 0 or 1 (inner classes).
   * - Method bodies are usually at depth 2+.
   * - We assume standard Java formatting.
   */
  static generateSkeleton(content: string): string {
    const lines = content.split('\n')
    let depth = 0
    let result = ''
    let hidden = false

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        if (!hidden) result += '\n'
        continue
      }

      // Calculate brace change
      // Note: This is a simple counter and can be fooled by strings/comments containing braces.
      // For a "Smart Context" feature, this trade-off is acceptable vs a full parser.
      // We strip comments for brace counting purposes to be slightly safer? 
      // No, that's complex. Let's assume code is valid and comments don't have unbalanced braces often.
      
      const openCount = (line.match(/{/g) || []).length
      const closeCount = (line.match(/}/g) || []).length
      
      const prevDepth = depth
      depth = depth + openCount - closeCount

      // Logic:
      // We want to show content that resides at depth 0 (Package/Import) and depth 1 (Class members).
      // Content at depth 2 (Method body) should be hidden.
      // However, the line that *starts* the method (public void foo() {) is at depth 1 -> 2. We want to show it.
      
      const isVisible = prevDepth <= 1 || (prevDepth === 2 && depth < 2) // Closing brace of method

      if (isVisible) {
        result += line + '\n'
        hidden = false
      } else {
        if (!hidden) {
          // Use indentation of the current line for the comment
          const indent = line.match(/^\s*/)?.[0] || '    '
          result += `${indent}// ... implementation hidden ...\n`
          hidden = true
        }
      }
    }
    
    return result
  }
}
