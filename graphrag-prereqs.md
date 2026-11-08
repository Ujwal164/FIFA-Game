# GraphRAG — prerequisites & rough plan

Read before the planning session (2026-11-04). We'll grill the open decisions, then build.

## What it is (one paragraph)

**Normal RAG** splits documents into chunks, turns them into vectors (embeddings), finds the chunks most *similar* to the question, and gives them to an LLM to answer.
**GraphRAG** first turns the data into a **knowledge graph**: things (nodes) and how they relate (edges). It then answers by **walking the graph**, often combined with vector search.

It shines on **multi-hop questions** that similarity search gets wrong, for example: *"Which players from Premier League clubs scored in the knockout rounds against a team they also faced in the group stage?"*

"Graphical" can also mean *showing* that graph. We can do both: answer the question **and** draw the subgraph the answer came from.

## Prerequisites (learn / skim)

1. **RAG basics:** embeddings, chunking, vector search, putting retrieved context into a prompt.
2. **Graph basics:** nodes, edges, properties, traversal. Skim **Neo4j + the Cypher query language** (`MATCH (p:Player)-[:SCORED_IN]->(m:Match) RETURN p`).
3. **LLM APIs:**
   - prompts and system prompts
   - **structured JSON output**
   - tool use
   - tokens and cost
4. **Docker:** to run Neo4j locally with one command.
5. **Evaluation:** a fixed list of test questions with known answers, so "better" is measurable instead of a feeling.

## Have ready

- [ ] Docker Desktop installed
- [ ] An LLM API key (in `.env`, never in code; you know why now)
- [ ] ~1 hour for the planning session

## Rough plan (phases)

| # | Phase | Output |
|---|---|---|
| 0 | **Decide** domain, question types, stack | answers in `spec.md` |
| 1 | **Data → graph.** Our World Cup snapshot is already structured: Player, Team, Club, Match, Stadium, Goal. Load it straight into a graph. Stretch goal: have the LLM extract entities from unstructured text (trivia, match reports). | graph in Neo4j |
| 2 | **Retrieval.** Question → (a) LLM writes a Cypher query, **or** (b) find the entities in the question and expand their neighbourhood. Plus vector search for text. | retriever + tests |
| 3 | **Answer** with the graph facts used, cited | API endpoint |
| 4 | **Evaluate** on 20–30 fixed questions | score you can track |
| 5 | **UI:** a chat page in Pulse '26 that also **draws the subgraph** behind each answer | the "graphical" part |

## Decisions for tomorrow (we'll grill these)

1. **Data:** reuse the World Cup data (recommended: it's clean, you know it, and the graph is obvious) or something new?
2. **Graph store:** Neo4j (industry standard, more to learn) or an in-memory graph in Node (simpler)?
3. **Language:** stay TypeScript/Node, or Python, where most GraphRAG libraries live (Microsoft GraphRAG, LlamaIndex)?
4. **Retrieval style:** text-to-Cypher, entity-neighbourhood, or both?
5. **Which LLM** and budget?
6. **Is visualising the graph a must-have?**
