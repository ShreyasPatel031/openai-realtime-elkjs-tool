/**
 * This file contains the process_user_requirements function which returns
 * sample architecture diagram instructions.
 */

/**
 * Process user requirements and return sample architecture diagram instructions
 * Returns an array of instructions for building an architecture diagram
 */
export const process_user_requirements = () => {
  console.group(`[user requirements] process_user_requirements`);
  console.time("process_user_requirements");
  
  // Return an array of step strings instead of one long string
  // const result = [
  //   `Please note these are instructions for you to follow. These operations have not applied to the graph.`,
    
  //         `/* ───────── 1. root groups (users + gcp) */
  //     batch_update({
  //       operations: [
  //         { name:"add_node", nodename:"users", parentId:"root",
  //           data:{ label:"End-Users", icon:"browser_client", style:"GREEN" } },
  //         { name:"add_node", nodename:"gcp", parentId:"root",
  //           data:{ label:"Google Cloud Platform", icon:"gcp_logo", style:"BLUE" } }
  //       ]
  //     })`,
          
  //         `/* ───────── 2. users */
  //     batch_update({
  //       operations: [
  //         { name:"add_node", nodename:"web_user",   parentId:"users",
  //           data:{ label:"Web",    icon:"browser_client", style:"GREEN" } },
  //         { name:"add_node", nodename:"mobile_user",parentId:"users",
  //           data:{ label:"Mobile", icon:"mobile_app",     style:"GREEN" } }
  //       ]
  //     })`,
          
  //         `/* ───────── 3-A. edge / CDN (nodes) */
  //     batch_update({
  //       operations: [
  //         { name:"add_node", nodename:"edge", parentId:"gcp",
  //           data:{ label:"Edge & CDN", icon:"cloud_cdn", style:"YELLOW" } },
  //         { name:"add_node", nodename:"cloud_cdn", parentId:"edge",
  //           data:{ label:"Cloud CDN", icon:"cloud_cdn", style:"YELLOW" } },
  //         { name:"add_node", nodename:"lb_https", parentId:"edge",
  //           data:{ label:"HTTPS LB", icon:"load_balancer_generic", style:"YELLOW" } },
  //         { name:"add_node", nodename:"cloud_armor", parentId:"edge",
  //           data:{ label:"Cloud Armor", icon:"cloud_armor", style:"YELLOW" } }
  //       ]
  //     })`,
          
  //         `/* ───────── 3-B. edge / CDN (edges) */
  //     batch_update({
  //       operations: [
  //         { name:"add_edge", edgeId:"e_cdn_lb", sourceId:"cloud_cdn", targetId:"lb_https",   label:"route"   },
  //         { name:"add_edge", edgeId:"e_waf_lb", sourceId:"cloud_armor", targetId:"lb_https", label:"protect" },
  //         { name:"add_edge", edgeId:"e_web_edge",   sourceId:"web_user",    targetId:"cloud_cdn", label:"HTTPS" },
  //         { name:"add_edge", edgeId:"e_mobile_edge",sourceId:"mobile_user", targetId:"cloud_cdn", label:"HTTPS" }
  //       ]
  //     })`,
          
  //         `/* ───────── 4. API & auth */
  //     batch_update({
  //       operations: [
  //         { name:"add_node", nodename:"api", parentId:"gcp",
  //           data:{ label:"API Gateway + Auth", icon:"api_gateway", style:"PURPLE" } },
  //         { name:"add_node", nodename:"idp", parentId:"api",
  //           data:{ label:"Identity Plat.", icon:"iam", style:"PURPLE" } },
  //         { name:"add_node", nodename:"api_gw", parentId:"api",
  //           data:{ label:"API Gateway", icon:"api_gateway", style:"PURPLE" } },
  //         { name:"add_edge", edgeId:"e_idp_gw", sourceId:"idp",     targetId:"api_gw", label:"JWT"   },
  //         { name:"add_edge", edgeId:"e_lb_api", sourceId:"lb_https", targetId:"api_gw", label:"HTTPS" }
  //       ]
  //     })`,
          
  //         `/* ───────── 5-A. backend nodes */
  //     batch_update({
  //       operations: [
  //         { name:"add_node", nodename:"backend", parentId:"gcp",
  //           data:{ label:"Backend Svcs", icon:"cloud_run", style:"GREY" } },
  //         { name:"add_node", nodename:"order_svc",  parentId:"backend",
  //           data:{ label:"Order",   icon:"cloud_run", style:"GREY" } },
  //         { name:"add_node", nodename:"risk_svc",   parentId:"backend",
  //           data:{ label:"Risk",    icon:"cloud_run", style:"GREY" } },
  //         { name:"add_node", nodename:"catalog_svc",parentId:"backend",
  //           data:{ label:"Catalog", icon:"cloud_run", style:"GREY" } }
  //       ]
  //     })`,
          
  //         `/* ───────── 5-B. backend edges */
  //     batch_update({
  //       operations: [
  //         { name:"add_edge", edgeId:"e_order_risk", sourceId:"order_svc", targetId:"risk_svc",   label:"score" },
  //         { name:"add_edge", edgeId:"e_api_order",  sourceId:"api_gw",    targetId:"order_svc",  label:"REST"  },
  //         { name:"add_edge", edgeId:"e_api_catalog",sourceId:"api_gw",    targetId:"catalog_svc",label:"REST"  }
  //       ]
  //     })`,
          
  //         `/* ───────── 6. cache */
  //     batch_update({
  //       operations: [
  //         { name:"add_node", nodename:"cache", parentId:"gcp",
  //           data:{ label:"Redis Cache", icon:"cache_redis", style:"GREEN" } },
  //         { name:"add_node", nodename:"redis", parentId:"cache",
  //           data:{ label:"Memorystore", icon:"cache_redis", style:"GREEN" } },
  //         { name:"add_edge", edgeId:"e_order_cache", sourceId:"order_svc", targetId:"redis", label:"session" }
  //       ]
  //     })`,
          
  //         `/* ───────── 7-A. data stores (nodes) */
  //     batch_update({
  //       operations: [
  //         { name:"add_node", nodename:"data", parentId:"gcp",
  //           data:{ label:"Data Stores", icon:"spanner", style:"GREEN" } },
  //         { name:"add_node", nodename:"spanner", parentId:"data",
  //           data:{ label:"Spanner", icon:"spanner", style:"GREEN" } },
  //         { name:"add_node", nodename:"firestore", parentId:"data",
  //           data:{ label:"Firestore", icon:"firestore", style:"GREEN" } }
  //       ]
  //     })`,
          
  //         `/* ───────── 7-B. data store edges */
  //     batch_update({
  //       operations: [
  //         { name:"add_edge", edgeId:"e_catalog_db", sourceId:"catalog_svc", targetId:"spanner",   label:"read"  },
  //         { name:"add_edge", edgeId:"e_order_db",   sourceId:"order_svc",   targetId:"spanner",   label:"write" },
  //         { name:"add_edge", edgeId:"e_risk_db",    sourceId:"risk_svc",    targetId:"spanner",   label:"read"  },
  //         { name:"add_edge", edgeId:"e_catalog_fs", sourceId:"catalog_svc", targetId:"firestore", label:"stock" }
  //       ]
  //     })`,
          
  //         `/* ───────── 8. orchestration */
  //     batch_update({
  //       operations: [
  //         { name:"add_node", nodename:"orchestration", parentId:"gcp",
  //           data:{ label:"Workflows", icon:"workflows", style:"PURPLE" } },
  //         { name:"add_node", nodename:"workflows", parentId:"orchestration",
  //           data:{ label:"Workflows", icon:"workflows", style:"PURPLE" } },
  //         { name:"add_node", nodename:"eventarc", parentId:"orchestration",
  //           data:{ label:"Eventarc", icon:"eventarc", style:"PURPLE" } },
  //         { name:"add_node", nodename:"cloud_tasks", parentId:"orchestration",
  //           data:{ label:"Cloud Tasks", icon:"cloud_tasks", style:"PURPLE" } },
  //         { name:"add_edge", edgeId:"e_order_flow", sourceId:"order_svc", targetId:"workflows", label:"invoke" },
  //         { name:"add_edge", edgeId:"e_flow_risk",  sourceId:"workflows", targetId:"risk_svc",  label:"branch" }
  //       ]
  //     })`,
          
  //         `/* ───────── 9-A. messaging nodes */
  //     batch_update({
  //       operations: [
  //         { name:"add_node", nodename:"messaging", parentId:"gcp",
  //           data:{ label:"Pub/Sub", icon:"pubsub", style:"YELLOW" } },
  //         { name:"add_node", nodename:"order_topic", parentId:"messaging",
  //           data:{ label:"order-topic", icon:"pubsub", style:"YELLOW" } },
  //         { name:"add_node", nodename:"dlq_topic", parentId:"messaging",
  //           data:{ label:"DLQ", icon:"message_queue", style:"YELLOW" } }
  //       ]
  //     })`,
          
  //         `/* ───────── 9-B. messaging edges */
  //     batch_update({
  //       operations: [
  //         { name:"add_edge", edgeId:"e_flow_topic", sourceId:"workflows", targetId:"order_topic", label:"publish" },
  //         { name:"add_edge", edgeId:"e_topic_dlq",  sourceId:"order_topic", targetId:"dlq_topic", label:"DLQ" }
  //       ]
  //     })`,
          
  //         `/* ───────── 10. monitoring */
  //     batch_update({
  //       operations: [
  //         { name:"add_node", nodename:"monitoring", parentId:"gcp",
  //           data:{ label:"Monitoring", icon:"cloud_monitoring", style:"GREY" } },
  //         { name:"add_node", nodename:"cloud_monitoring", parentId:"monitoring",
  //           data:{ label:"Monitoring", icon:"cloud_monitoring", style:"GREY" } },
  //         { name:"add_node", nodename:"cloud_logging", parentId:"monitoring",
  //           data:{ label:"Logging", icon:"cloud_logging", style:"GREY" } },
  //         { name:"add_node", nodename:"cloud_trace", parentId:"monitoring",
  //           data:{ label:"Trace", icon:"cloud_trace", style:"GREY" } },
  //         { name:"add_node", nodename:"profiler", parentId:"monitoring",
  //           data:{ label:"Profiler", icon:"stackdriver_profiler", style:"GREY" } }
  //       ]
  //     })`,
          
  //         `/* ───────── 11. third party services */
  //     batch_update({
  //       operations: [
  //         { name:"add_node", nodename:"external", parentId:"root",
  //           data:{ label:"External APIs", icon:"third_party_api", style:"GREY" } },
  //         { name:"add_node", nodename:"payment_gateway", parentId:"external",
  //           data:{ label:"Payment GW", icon:"payment_gateway", style:"GREY" } },
  //         { name:"add_node", nodename:"email_svc", parentId:"external",
  //           data:{ label:"Email", icon:"notification_service", style:"GREY" } },
  //         { name:"add_edge", edgeId:"e_payment", sourceId:"order_svc", targetId:"payment_gateway", label:"charge" },
  //         { name:"add_edge", edgeId:"e_email",   sourceId:"workflows", targetId:"email_svc",      label:"notify" }
  //       ]
  //     })`,
    
  //   `display_elk_graph({ title: "done" })`
  // ];
  
  console.timeEnd("process_user_requirements");
  console.groupEnd();
  
  // Trigger StreamViewer if available
  const streamViewerButton = document.querySelector('[data-streamviewer-trigger]') as HTMLButtonElement;
  if (streamViewerButton && !streamViewerButton.disabled) {
    console.log("🎯 process_user_requirements called - triggering StreamViewer");
    streamViewerButton.click();
  }
  
  const result: string[] = [];
  return result;
}; 