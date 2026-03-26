
try {
  const OrigRTC = window.RTCPeerConnection;
  if (OrigRTC) {
    const proto = OrigRTC.prototype;
    const propsToFix = [
      "addEventListener",
      "removeEventListener",
      "dispatchEvent",
    ];

    let needsReplacement = false;

    for (const prop of propsToFix) {
      const desc = Object.getOwnPropertyDescriptor(proto, prop);
      if (desc && !desc.writable && !desc.set) {
        try {
          Object.defineProperty(proto, prop, {
            ...desc,
            writable: true,
            configurable: true,
          });
        } catch {
          // defineProperty failed — prototype is likely frozen/sealed
          needsReplacement = true;
          break;
        }
      }
    }

    if (needsReplacement) {
      // Create an unfrozen wrapper class that delegates to the real RTCPeerConnection
      const PatchedRTC = function (
        this: RTCPeerConnection,
        config?: RTCConfiguration
      ) {
        const instance = new OrigRTC(config);
        // Copy the prototype chain so instanceof checks still work
        Object.setPrototypeOf(instance, PatchedRTC.prototype);
        return instance;
      } as unknown as typeof RTCPeerConnection;

      // Set up prototype chain: PatchedRTC.prototype -> OrigRTC.prototype
      PatchedRTC.prototype = Object.create(OrigRTC.prototype);
      PatchedRTC.prototype.constructor = PatchedRTC;

      // Copy static properties
      for (const key of Object.getOwnPropertyNames(OrigRTC)) {
        if (key !== "prototype" && key !== "length" && key !== "name") {
          try {
            const desc = Object.getOwnPropertyDescriptor(OrigRTC, key);
            if (desc) Object.defineProperty(PatchedRTC, key, desc);
          } catch {
            // skip non-configurable statics
          }
        }
      }

      // Replace global
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).RTCPeerConnection = PatchedRTC;
    }
  }
} catch (_) {
  // Silently ignore — if we can't fix it, the original error will surface
}
