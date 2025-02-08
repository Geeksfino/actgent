# Community Refinement Process

This document outlines the community refinement process within the graph framework, detailing the flow from the initial call to the final community labeling.

## 1. `GraphManager.refineCommunities(sessionId: string)`

*   **Purpose:** Initiates the community refinement process for a given session.
*   **Input:** `sessionId` - The ID of the session for which to refine communities.
*   **Process:**
    *   Queries the graph for nodes of type "entity" associated with the specified `sessionId`.
    *   Constructs a `communityInput` object containing the retrieved entity nodes and their metadata.
    *   Calls `this.processWithLLM(GraphTask.REFINE_COMMUNITIES, communityInput)` to trigger the LLM-based processing of the community refinement task.

## 2. `GraphManager.processWithLLM(task: GraphTask, input: any)`

*   **Purpose:** Acts as an intermediary, delegating the actual processing to the underlying LLM processor.
*   **Input:**
    *   `task` - The `GraphTask` to be performed (in this case, `GraphTask.REFINE_COMMUNITIES`).
    *   `input` - The input data for the task (the `communityInput` object).
*   **Process:**
    *   Calls `this.llm.process(task, input)`, where `this.llm` is an instance of `GraphLLMProcessor`.

## 3. `GraphLLMProcessor.process(task: GraphTask, input: any)`

*   **Purpose:** Handles different `GraphTask` values, including `GraphTask.REFINE_COMMUNITIES`.
*   **Input:**
    *   `task` - The `GraphTask` to be performed.
    *   `input` - The input data for the task.
*   **Process:**
    *   When `task` is `GraphTask.REFINE_COMMUNITIES`, it initiates the community detection process using the `CommunityDetector` class.

## 4. `CommunityDetector`

*   **Purpose:** Responsible for detecting and labeling communities within the graph.
*   **Process:**
    *   Uses the `LabelPropagation` class to detect initial communities based on the graph structure.
    *   Leverages the LLM to label these communities, providing meaningful descriptions for each community.

## 5. `LabelPropagation`

*   **Purpose:** Implements the label propagation algorithm for community detection.
*   **Process:**
    *   Iteratively updates node communities based on the communities of their neighbors until convergence.
    *   The `updateNodeCommunity` method is a key part of this process, determining how a node's community is updated based on its neighbors.
