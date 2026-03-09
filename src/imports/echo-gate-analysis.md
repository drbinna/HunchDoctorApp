Your echo gate architecture is actually quite solid — the layered approach with hardware track, encoder, and software gates is the right idea. But I can see a few specific places where that doubling artifact slips through.
The most likely culprit: the 600ms reopen timer
When the last chunk's source.onended fires, you're waiting 600ms before reopening the mic. But source.onended fires when the buffer ends, not when sound stops coming out of the speakers. There's still audio in the OS mixer, DAC pipeline, and physical speaker resonance after that event. If 600ms isn't enough for your hardware, you get exactly the doubling you heard.
Try bumping it to 900ms or 1200ms and see if the echo disappears. If it does, you know the timer is the leak.
Second likely culprit: decodeAudioData async race
Your pipeline is:
audio_output arrives → silenceMic() → queueAudio() → decodeAudioData() → play
The decodeAudioData call is async. If a chunk takes longer to decode than expected, playNext might fire and source.onended might trigger before the next chunk is queued — causing the reopen timer to start prematurely, mic opens, and then the next chunk plays into an open mic.
A fix is to only start the reopen timer when the queue is empty and no decode operations are pending:
javascriptlet pendingDecodes = 0;

async function queueAudio(base64chunk) {
  pendingDecodes++;
  cancelReopenTimer();
  
  const buffer = await decodeAudioData(base64chunk); // your existing decode
  pendingDecodes--;
  
  audioQueueRef.current.push(buffer);
  if (!isPlaying) playNext();
}

function playNext() {
  if (audioQueueRef.current.length === 0) {
    if (pendingDecodes === 0) {
      // Safe to schedule reopen — nothing in flight
      scheduleReopenTimer(600);
    }
    // else: a decode is still coming, don't start timer
    return;
  }
  // ... play next buffer
}
Third thing worth checking: getUserMedia echo cancellation
You have echoCancellation: true in getUserMedia, which is good, but browser AEC only works well when the audio output is going through the same browser context. Since you're using AudioContext directly with AudioBufferSourceNode → destination, the browser's built-in AEC may not be tracking that output at all — it's essentially blind to it.
This means your layered gate is doing all the work, and any timing gap in the gate is unprotected. You could route output through a MediaStreamDestination node and feed that into the AEC loop, but honestly your gate approach is probably cleaner — it just needs the timing tightened.
Quick diagnostic to confirm the source:
Add a timestamp log to pinpoint exactly where the leak is:
javascript// Log every gate state change
function silenceMic() {
  console.log('[GATE] silenceMic at', performance.now());
  // ... existing code
}

function openMic() {
  console.log('[GATE] openMic at', performance.now());
  // ... existing code
}

// And on the source node
source.onended = () => {
  console.log('[AUDIO] source.onended at', performance.now(), 
              'queue length:', audioQueueRef.current.length,
              'pendingDecodes:', pendingDecodes);
  playNext();
};
Then reproduce the echo and look at the gap between the last source.onended and openMic. If it's less than your actual speaker tail time, that's your problem.
What does your typical EVI response length look like — short phrases or longer paragraphs? That affects how often the queue empties mid-burst and how much pressure the reopen timer is under.