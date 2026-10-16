import { logger } from "../../../config/logger.ts";
import { processPaymentEventBatch } from "./payment-event.worker.service.ts";

const DEFAULT_INTERVAL_MS = 5_000; 

let timer: ReturnType<typeof setInterval> | undefined; 
let running = false;

export function startPaymentEventScheduler( 
    intervalMs = DEFAULT_INTERVAL_MS, 
): void { 
    if (timer) { 
        logger.warn( 
            "Payment event scheduler is already running", 
        ); 
        return; 
    } 
    
    if (
        !Number.isFinite(intervalMs) || intervalMs < 1_000
    ) { 
        throw new Error( 
            "Payment event scheduler interval must be at least 1000ms", 
        ); 
    } 
    
    logger.info( 
        { intervalMs }, 
        "Starting payment event scheduler", 
    ); 
    
    const runBatch = async (): Promise<void> => { 
        if (running) { 
            logger.debug( 
                "Skipping payment event tick because the previous batch is still running", 
            ); 
            return; 
        } 
        
        running = true; 
        
        try { 
            const result = await processPaymentEventBatch(); 
            
            if (result.claimed > 0) { 
                logger.info( 
                    result, 
                    "Payment event batch completed", 
                ); 
            } 
        } catch (error) { 
            logger.error( 
                { err: error }, 
                "Payment event batch failed", 
            ); 
        } finally { 
            running = false; 
        } 
    }; 
        
    // Process any already-persisted events immediately. 
    void runBatch(); 
    timer = setInterval( 
        () => void runBatch(), 
        intervalMs, 
    ); 
        
    timer.unref(); 
}


export async function stopPaymentEventScheduler(): Promise<void> { 
    if (timer) { 
        clearInterval(timer); 
        timer = undefined; 
    } 
    
    while (running) { 
        await new Promise<void>((resolve) => { 
            setTimeout(resolve, 100); 
        }); 
    } 
    logger.info( 
        "Payment event scheduler stopped", 
    ); 
}