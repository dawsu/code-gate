import { getAllFiles, getFileContent, getStagedFileContent } from '../git.js'
import { JavaParser } from './parser/java.js'

export class ContextManager {
  private allFiles: string[] = []
  private initialized = false

  private init() {
    if (!this.initialized) {
      this.allFiles = getAllFiles()
      this.initialized = true
    }
  }

  /**
   * Retrieve enhanced context for a given file.
   * Currently supports Java files by providing:
   * 1. Skeleton of the current file (class structure, fields, method signatures).
   * 2. Skeletons of imported files (related context).
   */
  getContext(file: string): string {
    if (!file.endsWith('.java')) {
      return ''
    }

    this.init()

    // 1. Get Staged Content (the version being committed)
    const stagedContent = getStagedFileContent(file)
    if (!stagedContent) return ''

    let output = ''

    // 2. Generate Skeleton for Current File
    // This helps the LLM see the full class structure even if the diff is small.
    const currentSkeleton = JavaParser.generateSkeleton(stagedContent)
    output += `\n【File Structure (Current): ${file}】\n${currentSkeleton}\n`

    // 3. Find and Process Related Files
    const imports = JavaParser.parseImports(stagedContent)
    const relatedFiles = this.findRelatedFiles(imports, file)
    
    // Budget Limit: Max 5 related files
    const MAX_FILES = 5
    let count = 0

    for (const rel of relatedFiles) {
      if (count >= MAX_FILES) break
      
      const content = getFileContent(rel)
      if (!content) continue

      const skeleton = JavaParser.generateSkeleton(content)
      output += `\n【Related File Context: ${rel}】\n${skeleton}\n`
      count++
    }

    return output
  }

  private findRelatedFiles(imports: string[], currentFile: string): string[] {
    const found: Set<string> = new Set()
    
    // Filter out standard libraries and common frameworks to save tokens
    const candidates = imports.filter(imp => 
      !imp.startsWith('java.') && 
      !imp.startsWith('javax.') &&
      !imp.startsWith('jakarta.') &&
      !imp.startsWith('org.springframework.') &&
      !imp.startsWith('org.slf4j.') &&
      !imp.startsWith('org.junit.') &&
      !imp.startsWith('lombok.')
    )

    for (const imp of candidates) {
       // Convert package format to file path format
       // e.g. com.example.User -> com/example/User.java
       const suffix = imp.replace(/\./g, '/') + '.java'
       
       // Find matches in allFiles
       // We look for files that END with this path.
       // e.g. src/main/java/com/example/User.java ends with com/example/User.java
       const match = this.allFiles.find(f => f.endsWith(suffix))
       
       if (match && match !== currentFile) {
         found.add(match)
       }
    }
    return Array.from(found)
  }
}

export const contextManager = new ContextManager()
