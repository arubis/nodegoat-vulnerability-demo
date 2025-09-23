# Claude CLI Integration Notes

## Streaming Output Behavior

Through extensive testing, we've determined how the Claude CLI handles streaming output:

1. **Standard vs Streaming Format:**
   - The Claude CLI (v0.2.92) supports a `stream-json` output format that delivers responses in multiple logical chunks
   - Chunks correspond to different stages of processing (tool use, analysis, solution generation)
   - First chunk typically arrives in 5-6 seconds vs 50+ seconds for standard JSON format

2. **Chunk Structure:**
   - Chunks aren't word-by-word streaming but logical sections of the response
   - Early chunks often contain tool requests or context-gathering information
   - Middle chunks contain analysis and interim results
   - Final chunks contain the solution and metadata (like cost)

3. **Implementation Approach:**
   ```javascript
   const args = [
     '--print',
     '--output-format', 'stream-json',  // Use stream-json for better UX
     '--verbose'
   ];
   ```

4. **Processing Recommendations:**
   - Display progress indicators with elapsed time 
   - Update status messages based on chunk content analysis
   - Show content previews as they arrive
   - Parse the complete solution from all chunks when finished

## Testing Results

Our testing revealed these key patterns:

- Regular `json` format: Single large response after 50+ seconds
- `stream-json` format: Multiple chunks (typically 6-8), first chunk in ~5-6 seconds
- `--stream` flag: Not supported in current version
- Output structure: Complex JSON with sections for tools, content, and metadata
- Solution format: May be direct JSON or in code blocks within text content

## UX Improvements

The `stream-json` format significantly improves user experience:

1. Shows initial response much faster (5-6s vs 50+s)
2. Allows tracking progress through different stages
3. Provides more responsive feedback to users
4. Maintains structure for reliable parsing

## Known Limitations

- Not true token-by-token streaming
- Response parsing requires handling multiple JSON objects
- Higher complexity in output handling code
- Timeouts should be set to at least 3-5 minutes for complex prompts

## Reference Implementation

See `test-claude-temp/test-recommended-approach.js` for a reference implementation that demonstrates:
- Progress indicators with elapsed time
- Stage-based updates
- Content previews
- Final solution parsing

## Future Improvements

When true streaming support becomes available in Claude CLI, we can revisit this implementation. Meanwhile, our current approach provides a good balance of responsiveness and reliability.