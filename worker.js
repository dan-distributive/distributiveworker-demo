let worker = null;

async function toggleWorker() {
  // Logging function
  const consoleEl = document.querySelector("#workerConsole");
  const log = (msg) => {
    const ts = new Date().toLocaleTimeString();
    consoleEl.value += `[${ts}] ${msg}\n\n`;
    consoleEl.scrollTop = consoleEl.scrollHeight;
  };

  if (!worker) {
    //
    // Set DCP identity for this worker
    //
      const id = await new dcp.wallet.Keystore(
        "0x5356d59ec41a45672e4be75a8761e1721f7b48941226f2775722907238f805be","" // web-worker-demo-id
      );
    await dcp.identity.set(id);

    //
    // Configure Worker
    //
    worker = new dcp.worker.DistributiveWorker({
      
      // Set the DCP Bank account where compute credits earned from work are deposited
      paymentAddress: new dcp.wallet.Address(
        "0x079dac0612c710ab4e975dab7171c7e4bef78c5a" // or (await dcp.wallet.get()).address
      ),

      /*
      // Set the compute group(s) the worker will join
      computeGroups: [
        { joinKey: "demo", joinSecret: "dcp" },
      ],

      // Configure whether this worker remains part of the public compute group or opts out
      leavePublicGroup: true,
      */

      // Restrict the worker to specific job IDs, e.g. ["jeHgigTXPURl6xMgUz9oNw", "..."]
      jobIds: false,

      // Set number CPU and GPU cores available to use
      cores: { cpu: 4, gpu: 1 },

      // Set target % utilization for cpu and gpu
      utilization: { cpu: 1, gpu: 1 },

      // Set the maximum number of concurrent sandboxes that can execute job slices
      maxSandboxes: 4,

      // Set minimum-wage vector defining the lowest-paying slices it will accept
      minimumWage: {
        "CPU":  0.0060 /1000,      //   Compute Credits per CPU-second
        "GPU":  0.0241 /1000,      //   Compute Credits per GPU-second
        "in":   0.0112 /1000,      //   Compute Credits per MB of inbound network traffic
        "out":  0.0112 /1000,      //   Compute Credits per MB of outbound network traffic
      },
      
      // Set allow origins
      allowOrigins: {
        fetchWorkFunctions: [
          null
        ],
        fetchArguments: [
          null
        ],
        fetchData: [
          null
        ],
        sendResults: [
          null
        ],
        any: [
          null
        ]
      },

    });


    //
    // WORKER EVENTS
    //

    // Fired when fetching work from the scheduler
    worker.on("fetch", ev => {
      const jobIds = Object.keys(ev.jobs);

      if (jobIds.length === 0) {
        log("[worker.fetch] No work; retrying in 7 seconds...");
        return;
      }

      const sizeKB = (ev.fetchSize / 1024).toFixed(2);
      log(`[worker.fetch] fetchSize: ${sizeKB} KB`);

      for (const jobId of jobIds) {
        const job = ev.jobs[jobId];
        const sliceCount = ev.slices[jobId] || 0;

        consoleEl.value += 
          `  jobId: ${jobId}, ` +
          `name: ${job.name}, ` +
          `description: ${job.description}, ` +
          `link: ${job.link}, ` +
          `slicesFetched: ${sliceCount}\n\n`;
      }
      consoleEl.scrollTop = consoleEl.scrollHeight;
    });

    // Fired after a slice result is sent (or fails to send)
    worker.on("result", (urlOrError, size) => {
      if (urlOrError instanceof Error) {
        log(`[worker.result] error ${urlOrError.message}`);
      } else {
        log(`[worker.result] sent ${(size / 1024).toFixed(2)} KB to ${urlOrError || "scheduler"}`);
      }
    });

    // Payment received for completed slices
    let totalEarned = 0;
    const totalEarnedEl = document.getElementById("total-earned");
    worker.on("payment", (payment, paymentAccount, jobAddress, slice) => {
      totalEarned += Number(payment);
      if (totalEarnedEl) {
        totalEarnedEl.textContent = `${totalEarned.toFixed(3)} ⊇`;
      }
      log(
        `[worker.payment] ` +
        `payment: ${payment} ⊇, ` +
        `depositAccount: ${paymentAccount}, ` +
        `jobId: ${jobAddress}, ` +
        `slice: ${slice}`
      );
    });

    // Worker connected to scheduler
    worker.on("connect", url => {
      log(`[worker.connect] connected to ${url}`);
    });

    // Worker disconnected from scheduler
    worker.on("disconnect", url => {
      log(`[worker.disconnect] disconnected from ${url}`);
    });

    // Worker stop requested; shutdown starting
    worker.on("stop", abort => {
      log("[worker.stop] worker stopping...");
    });

    // Worker shutdown complete
    worker.on("end", () => {
      log("[worker.end] worker fully stopped");
    });

    // Internal error occurred in worker
    worker.on("error", err => {
      log(`[worker.error] ${JSON.stringify(err, null, 2)}`);
    });

    // Warning occurred in worker
    worker.on("warning", warn => {
      log(`[worker.warning] ${JSON.stringify(warn, null, 2)}`);
    });

    // New sandbox created by the worker
    worker.on("sandbox", sandbox => {
      log(`[worker.sandbox_${sandbox.id}] new sandbox created: ${sandbox.id}`);
    });


    //
    // SANDBOX EVENTS
    //

    // Fired on sandbox event
    worker.on("sandbox", (sandbox) => {

      // Ready event (sandbox prepared for execution)
      sandbox.on("ready", () => {
        log(`[sandbox_${sandbox.id}.ready] sandbox is ready`);
      });

      // Job info event (job metadata delivered to sandbox)
      sandbox.on("job", (jobInfo) => {
        log(
          `[sandbox_${sandbox.id}.job] ` +
          `jobId: ${jobInfo.id}, ` +
          `name: ${jobInfo.name}, ` //+
          // `description: "${jobInfo.description}", ` +
          // `link: "${jobInfo.link}"`
        );
      });

      // Slice started
      sandbox.on("slice", (sliceNumber) => {
        log(`[sandbox_${sandbox.id}.slice] slice started: ${sliceNumber}`);
      });

      // Progress events emitted from job code
      sandbox.on("progress", (value) => {
        log(`[sandbox_${sandbox.id}.progress] ${value.toFixed(1)}%`);
      });

      // Metrics from job code (GPU/CPU usage, etc.)
      sandbox.on("metrics", (slice, m) => {
        log(
          `[sandbox_${sandbox.id}.metrics] ` +
          `slice: ${slice}, ` +
          `elapsed: ${m.elapsed.toFixed(3)} sec, ` +
          `CPU: ${m.CPU.toFixed(3)} sec, ` +
          `GPU: ${m.GPU.toFixed(3)} sec, ` +
          `in: ${(m.in / 1024).toFixed(3)} KB, ` +
          `out: ${(m.out / 1024).toFixed(3)} KB`
        );
      });

      // Slice finished
      sandbox.on("sliceEnd", (sliceNumber) => {
        log(`[sandbox_${sandbox.id}.sliceEnd] slice finished: ${sliceNumber}`);
      });

      // Payment event inside sandbox
      sandbox.on("payment", (payment) => {
        log(`[sandbox_${sandbox.id}.payment] ${payment} ⊇`);
      });

      // Sandbox terminated cleanly
      sandbox.on("end", () => {
        log(`[sandbox_${sandbox.id}.end] sandbox fully stopped`);
      });

    });

    //
    // Start the worker
    //
    document.querySelector("#work-btn .btn-text").textContent = "STOP";
    await worker.start();
    log(
      `DCP Worker started\n\n` +
      `  Worker identity: ${id.address}\n\n` +
      `  Deposit account: ${worker.config.paymentAddress}\n\n` +
      `  Compute groups:  ${
            worker.config.computeGroups?.length
            ? worker.config.computeGroups.map(g => g.joinKey).join(", ")
            : "DCP Global (Public Group)"}`
    );

  } else {
    //
    // Stop the worker
    //
    document.querySelector("#work-btn .btn-text").textContent = "STOPPING...";
    await worker.stop();
    worker = null;
    document.querySelector("#work-btn .btn-text").textContent = "STOPPED";
  }
}