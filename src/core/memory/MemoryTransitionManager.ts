import { Subject, merge, from, Observable, EMPTY, interval } from 'rxjs';
import { debounceTime, filter, mergeMap, distinctUntilChanged, map, bufferTime, retry, catchError, withLatestFrom } from 'rxjs/operators';
import { WorkingMemory } from './modules/working/WorkingMemory';
import { EpisodicMemory } from './modules/episodic/EpisodicMemory';
import { 
    IMemoryUnit, MemoryType, MemoryEvent, MemoryEventType, 
    ConsolidationRule, EmotionalState, SessionMemoryContext, 
    MemoryFilter, IMemoryEventHandler, IMemoryMonitor 
} from './types';
import { logger } from '../Logger';
import { NLPService } from './modules/semantic/nlp/NLPService';
import { ConceptGraph } from './modules/semantic/ConceptGraph';

export class MemoryTransitionManager {
    private consolidationRules: ConsolidationRule[] = [];
    private eventsSubject$ = new Subject<MemoryEvent>();
    public readonly events$ = this.eventsSubject$.asObservable();
    private handlers: Map<MemoryEventType, IMemoryEventHandler[]> = new Map();
    private monitors: Map<string, IMemoryMonitor> = new Map();

    // Memory operation streams
    private readonly accessStream$ = new Subject<{ memoryId: string, timestamp: Date }>();
    private readonly capacityStream$ = new Subject<{ size: number, capacity: number }>();
    private readonly contextStream$ = new Subject<SessionMemoryContext>();
    private readonly emotionalStream$ = new Subject<EmotionalState>();

    private nlpService: NLPService;
    private conceptGraph: ConceptGraph;

    constructor(
        private workingMemory: WorkingMemory,
        private episodicMemory: EpisodicMemory
    ) {
        this.setupDefaultRules();
        this.setupEventStreams();

        // Initialize NLP service and concept graph
        this.nlpService = new NLPService('your-api-key'); // Replace with actual API key
        this.conceptGraph = new ConceptGraph();
    }

    /**
     * Register a memory event handler
     */
    public registerHandler(handler: IMemoryEventHandler): void {
        const eventTypes = handler.canHandleEventTypes();
        
        for (const eventType of eventTypes) {
            if (!this.handlers.has(eventType)) {
                this.handlers.set(eventType, []);
            }
            this.handlers.get(eventType)!.push(handler);

            // Subscribe to events of this type
            this.events$.pipe(
                filter(event => event.type === eventType)
            ).subscribe(async (event) => {
                try {
                    await handler.onEvent(event);
                } catch (error) {
                    logger.error(`Error in memory event handler for ${eventType}:`, error);
                }
            });
        }
    }

    /**
     * Unregister a memory event handler
     */
    public unregisterHandler(handler: IMemoryEventHandler): void {
        const eventTypes = handler.canHandleEventTypes();
        
        for (const eventType of eventTypes) {
            const handlers = this.handlers.get(eventType);
            if (handlers) {
                const index = handlers.indexOf(handler);
                if (index !== -1) {
                    handlers.splice(index, 1);
                }
                if (handlers.length === 0) {
                    this.handlers.delete(eventType);
                }
            }
        }
    }

    /**
     * Emit a memory event
     */
    public emitEvent(event: MemoryEvent): void {
        this.eventsSubject$.next(event);
    }

    private isMonitoring = false;

    /**
     * Register a memory monitor
     */
    public registerMonitor(monitor: IMemoryMonitor): void {
        if (this.monitors.has(monitor.id)) {
            logger.warn(`Monitor with ID ${monitor.id} already exists. Stopping existing monitor.`);
            this.monitors.get(monitor.id)?.stop();
        }
        
        this.monitors.set(monitor.id, monitor);
        
        // If monitoring is already active, start the new monitor
        if (this.isMonitoring) {
            monitor.start();
        }
    }

    /**
     * Unregister a memory monitor
     */
    public unregisterMonitor(monitorId: string): void {
        const monitor = this.monitors.get(monitorId);
        if (monitor) {
            monitor.stop();
            this.monitors.delete(monitorId);
        }
    }

    /**
     * Start all registered monitors
     */
    public startMonitoring(): void {
        if (this.isMonitoring) {
            return;
        }

        this.isMonitoring = true;
        for (const monitor of this.monitors.values()) {
            monitor.start();
        }
    }

    /**
     * Stop all registered monitors
     */
    public stopMonitoring(): void {
        if (!this.isMonitoring) {
            return;
        }

        this.isMonitoring = false;
        for (const monitor of this.monitors.values()) {
            monitor.stop();
        }
    }

    /**
     * Get a monitor by ID
     */
    public getMonitor(monitorId: string): IMemoryMonitor | undefined {
        return this.monitors.get(monitorId);
    }

    /**
     * Get all registered monitors
     */
    public getMonitors(): Map<string, IMemoryMonitor> {
        return new Map(this.monitors);
    }

    private monitorMemoryOperations() {
        // Monitor working memory capacity
        interval(1000).pipe(
            map(() => ({
                size: this.workingMemory.getCurrentSize(),
                capacity: this.workingMemory.getCapacity()
            })),
            filter(({ size, capacity }) => size > capacity * 0.8),
            distinctUntilChanged((prev, curr) => 
                prev.size === curr.size && prev.capacity === curr.capacity
            )
        ).subscribe(stats => 
            this.capacityStream$.next(stats)
        );

        // Process memory access patterns
        this.accessStream$.pipe(
            bufferTime(5000),
            filter(accesses => accesses.length > 0),
            map(accesses => this.analyzeAccessPatterns(accesses))
        ).subscribe();

        // Handle context changes
        this.contextStream$.pipe(
            distinctUntilChanged((prev, curr) => 
                this.calculateContextOverlap(prev, curr) > 0.8
            ),
            withLatestFrom(this.getActiveMemories()),
            mergeMap(([context, memories]) => 
                this.handleContextTransition(context, memories)
            )
        ).subscribe();

        // Process emotional peaks
        this.emotionalStream$.pipe(
            distinctUntilChanged((prev, curr) => 
                !this.isEmotionalPeak(prev, curr)
            ),
            withLatestFrom(this.getActiveMemories()),
            mergeMap(([emotion, memories]) => 
                this.handleEmotionalTransition(emotion, memories)
            )
        ).subscribe();

        // Process semantic memory periodically
        interval(60000).pipe(
            mergeMap(() => this.processSemanticMemory())
        ).subscribe();
    }

    private async processSemanticMemory(): Promise<void> {
        const filter: MemoryFilter = { types: [MemoryType.WORKING] };
        const memories = await this.workingMemory.query(filter);

        for (const memory of memories) {
            if (!memory) continue;
            const content = typeof memory.content === 'string' ? memory.content : memory.content.data.advice;
            const extractedConcepts = await this.nlpService.extractConcepts(content);

            for (const concept of extractedConcepts.concepts) {
                await this.conceptGraph.addNode(concept);
            }
            for (const relation of extractedConcepts.relations) {
                await this.conceptGraph.addRelation(relation);
            }
        }
    }

    private getActiveMemories(): Observable<IMemoryUnit[]> {
        const filter: MemoryFilter = { types: [MemoryType.WORKING, MemoryType.EPISODIC] };
        return from(this.workingMemory.query(filter)).pipe(
            map(memories => memories.filter((memory): memory is IMemoryUnit => memory !== null))
        );
    }

    private analyzeAccessPatterns(accesses: { memoryId: string, timestamp: Date }[]): void {
        // Implement access pattern analysis
        // Example: Detect frequently co-accessed memories
    }

    public onMemoryAccess(memoryId: string): void {
        this.accessStream$.next({
            memoryId,
            timestamp: new Date()
        });
        this.emitEvent({
            type: MemoryEventType.MEMORY_ACCESS,
            timestamp: new Date(),
            memory: null,
            metadata: new Map([['memoryId', memoryId]])
        });
    }

    public onContextChange(context: SessionMemoryContext): void {
        this.contextStream$.next(context);
        this.emitEvent({
            type: MemoryEventType.CONTEXT_CHANGE,
            timestamp: new Date(),
            memory: null,
            context
        });
    }

    public onEmotionalChange(emotion: EmotionalState): void {
        this.emotionalStream$.next(emotion);
        this.emitEvent({
            type: MemoryEventType.EMOTIONAL_PEAK,
            timestamp: new Date(),
            memory: null,
            emotion
        });
    }

    private async handleContextTransition(
        context: SessionMemoryContext, 
        memories: IMemoryUnit[]
    ): Promise<void> {
        for (const memory of memories) {
            const contextualAlignment = await this.calculateContextualAlignment(memory, context);
            if (contextualAlignment < 0.3) {
                await this.transitionToEpisodic(memory, 'context_change');
            }
        }
    }

    private async handleEmotionalTransition(
        emotion: EmotionalState,
        memories: IMemoryUnit[]
    ): Promise<void> {
        for (const memory of memories) {
            const emotionalAlignment = this.calculateEmotionalAlignment(
                memory.metadata.get('emotion') as EmotionalState,
                emotion
            );
            if (emotionalAlignment < 0.3) {
                await this.transitionToEpisodic(memory, 'emotional_peak');
            }
        }
    }

    private async transitionToEpisodic(memory: IMemoryUnit, reason: string): Promise<void> {
        try {
            const transitionedMemory = {
                ...memory,
                memoryType: MemoryType.EPISODIC,
                metadata: new Map(memory.metadata).set('transitionReason', reason)
            };

            await this.episodicMemory.store(transitionedMemory);
            await this.workingMemory.delete(memory.id);

            this.eventsSubject$.next({
                type: MemoryEventType.CONSOLIDATE,
                memory: transitionedMemory,
                timestamp: new Date()
            });
        } catch (error) {
            logger.error('Failed to transition memory:', error);
        }
    }

    private isEmotionalPeak(prev: EmotionalState, curr: EmotionalState): boolean {
        if (!prev || !curr) return false;
        const valenceDiff = Math.abs((curr.valence || 0) - (prev.valence || 0));
        const arousalDiff = Math.abs((curr.arousal || 0) - (prev.arousal || 0));
        return valenceDiff > 0.5 || arousalDiff > 0.5;
    }

    private calculateContextOverlap(prev: SessionMemoryContext, curr: SessionMemoryContext): number {
        // Implement context overlap calculation
        return 0.5; // Placeholder
    }

    private calculateEmotionalAlignment(emotion1: EmotionalState, emotion2: EmotionalState): number {
        if (!emotion1 || !emotion2) return 0;
        const valenceDiff = Math.abs((emotion1.valence || 0) - (emotion2.valence || 0));
        const arousalDiff = Math.abs((emotion1.arousal || 0) - (emotion2.arousal || 0));
        return 1 - ((valenceDiff + arousalDiff) / 4);
    }

    private async calculateContextualAlignment(memory: IMemoryUnit, context: SessionMemoryContext): Promise<number> {
        // Implement context alignment calculation
        return 0.5; // Placeholder
    }

    private setupDefaultRules(): void {
        this.consolidationRules = [
            {
                name: 'Capacity Based',
                condition: (event) => event.type === MemoryEventType.CAPACITY_WARNING,
                priority: 1,
                targetMemoryType: MemoryType.EPISODIC
            },
            {
                name: 'Emotional Peak',
                condition: (event) => 
                    event.type === MemoryEventType.EMOTIONAL_PEAK && 
                    this.isSignificantEmotion(event.emotion),
                priority: 2,
                targetMemoryType: MemoryType.EPISODIC
            },
            {
                name: 'Context Change',
                condition: (event) => 
                    event.type === MemoryEventType.CONTEXT_CHANGE && 
                    this.isSignificantContextChange(event.context),
                priority: 3,
                targetMemoryType: MemoryType.EPISODIC
            }
        ];
    }

    private setupEventStreams(): void {
        // Monitor working memory operations
        this.monitorMemoryOperations();

        // Set up consolidation pipeline
        this.eventsSubject$.pipe(
            // Filter out events without memory
            filter((event): event is MemoryEvent & { memory: IMemoryUnit } => event.memory !== null),
            // Group by consolidation rule
            mergeMap(event => this.applyConsolidationRules(event)),
            // Handle transitions with retry logic
            mergeMap(({ memory, rule }) => 
                from(this.transitionMemory(memory, rule)).pipe(
                    retry(3),
                    catchError(err => {
                        logger.error('Failed to transition memory:', err);
                        return EMPTY;
                    })
                )
            )
        ).subscribe();
    }

    private async processEvents(events: MemoryEvent[]): Promise<void> {
        // Process each event
        for (const event of events) {
            this.eventsSubject$.next(event);
        }
    }

    private applyConsolidationRules(event: MemoryEvent): Observable<{ memory: IMemoryUnit; rule: ConsolidationRule }> {
        if (!event.memory) {
            return EMPTY;
        }

        return from(this.consolidationRules)
            .pipe(
                filter(rule => rule.condition(event)),
                map(rule => ({ memory: event.memory!, rule }))
            );
    }

    private async transitionMemory(memory: IMemoryUnit, rule: ConsolidationRule): Promise<void> {
        // Create memory in target store
        const transitionedMemory: IMemoryUnit = {
            ...memory,
            memoryType: rule.targetMemoryType,
            metadata: new Map(memory.metadata)
        };

        // Add transition metadata
        transitionedMemory.metadata.set('transitionRule', rule.name);
        transitionedMemory.metadata.set('originalType', memory.memoryType);
        transitionedMemory.metadata.set('transitionTime', new Date().toISOString());

        // Store in target memory and remove from source
        if (rule.targetMemoryType === MemoryType.EPISODIC) {
            await this.episodicMemory.store(transitionedMemory);
            await this.workingMemory.delete(memory.id);
        }
    }

    private isSignificantEmotion(emotion?: EmotionalState): boolean {
        if (!emotion || emotion.valence === undefined || emotion.arousal === undefined) {
            return false;
        }
        return Math.abs(emotion.valence) > 0.7 || Math.abs(emotion.arousal) > 0.7;
    }

    private isSignificantContextChange(context?: SessionMemoryContext): boolean {
        // Implement context change significance check
        return true; // Placeholder
    }
}
