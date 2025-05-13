import { RawGraph } from "./types/index";
import { STYLES } from "./styles";

export const getInitialElkGraph = (): RawGraph => ({
  id: "root"
});

//     {
//       id: "users",
//       data: {
//         label: "End-Users",
//         icon: "browser_client",
//         style: STYLES.GREEN
//       },
//       children: [
//         { id: "web_user",    data: { label: "Web Client",    icon: "browser_client" } },
//         { id: "mobile_user", data: { label: "Mobile Client", icon: "mobile_app"     } }
//       ]
//     },

//     /* ─────────────────────── 2. GCP ─────────────────────── */
//     {
//       id: "gcp",
//       data: {
//         label: "Google Cloud Platform",
//         icon: "gcp_logo",
//         style: STYLES.BLUE
//       },

//       children: [
//         /* Edge / CDN */
//         {
//           id: "frontend",
//           data: {
//             label: "Edge & CDN",
//             icon: "cloud_cdn",
//             style: STYLES.YELLOW
//           },
//           children: [
//             { id: "cloud_cdn",   data: { label: "Cloud CDN",      icon: "cloud_cdn" } },
//             { id: "lb_https",    data: { label: "HTTP(S) LB",     icon: "load_balancer_generic" } },
//             { id: "cloud_armor", data: { label: "Cloud Armor",    icon: "cloud_armor" } }
//           ],
//           edges: [
//             { id: "e_cdn_lb", sources: ["cloud_cdn"], targets: ["lb_https"], labels: [{ text: "Edge routing" }] },
//             { id: "e_waf_lb", sources: ["cloud_armor"], targets: ["lb_https"], labels: [{ text: "Protect" }] }
//           ]
//         },

//         /* API layer */
//         {
//           id: "api_layer",
//           data: {
//             label: "API Gateway & Auth",
//             icon: "api_gateway",
//             style: STYLES.PURPLE
//           },
//           children: [
//             { id: "api_gw", data: { label: "API Gateway", icon: "api_gateway" } },
//             { id: "idp",    data: { label: "Identity Platform", icon: "iam" } }
//           ],
//           edges: [
//             { id: "e_idp_gw", sources: ["idp"], targets: ["api_gw"], labels: [{ text: "JWT verify" }] }
//           ]
//         },

//         /* Cache */
//         {
//           id: "cache_layer",
//           data: {
//             label: "Redis Cache",
//             icon: "cache_redis",
//             style: STYLES.GREEN
//           },
//           children: [
//             { id: "redis", data: { label: "Memorystore Redis", icon: "cache_redis" } }
//           ]
//         },

//         /* Backend services */
//         {
//           id: "backend_svcs",
//           data: {
//             label: "Backend Services",
//             icon: "cloud_run",
//             style: STYLES.GREY
//           },
//           children: [
//             { id: "catalog_svc", data: { label: "Catalog Svc", icon: "cloud_run" } },
//             { id: "order_svc",   data: { label: "Order Svc",   icon: "cloud_run" } },
//             { id: "risk_svc",    data: { label: "Risk Score",  icon: "cloud_run" } }
//           ],
//           edges: [
//             { id: "e_order_risk", sources: ["order_svc"], targets: ["risk_svc"], labels: [{ text: "Score" }] }
//           ]
//         },

//         /* Orchestration */
//         {
//           id: "orchestration",
//           data: {
//             label: "Workflows & Tasks",
//             icon: "workflows",
//             style: STYLES.PURPLE
//           },
//           children: [
//             { id: "workflows",   data: { label: "Workflows",   icon: "workflows" } },
//             { id: "eventarc",    data: { label: "Eventarc",    icon: "eventarc" } },
//             { id: "cloud_tasks", data: { label: "Cloud Tasks", icon: "cloud_tasks" } }
//           ]
//         },

//         /* Data layer */
//         {
//           id: "data_layer",
//           data: {
//             label: "Data Stores",
//             icon: "spanner",
//             style: STYLES.GREEN
//           },
//           children: [
//             { id: "spanner",   data: { label: "Cloud Spanner", icon: "spanner" } },
//             { id: "firestore", data: { label: "Firestore",     icon: "firestore" } }
//           ]
//         },

//         /* Messaging */
//         {
//           id: "messaging",
//           data: {
//             label: "Pub/Sub Topics",
//             icon: "pubsub",
//             style: STYLES.YELLOW
//           },
//           children: [
//             { id: "order_topic", data: { label: "order-events", icon: "pubsub" } },
//             { id: "dlq_topic",   data: { label: "DLQ",          icon: "message_queue" } }
//           ],
//           edges: [
//             { id: "e_topic_dlq", sources: ["order_topic"], targets: ["dlq_topic"], labels: [{ text: "Dead-letter" }] }
//           ]
//         },

//         /* Monitoring */
//         {
//           id: "monitoring",
//           data: {
//             label: "Monitoring & Tracing",
//             icon: "cloud_monitoring",
//             style: STYLES.GREY
//           },
//           children: [
//             { id: "cloud_monitoring", data: { label: "Monitoring", icon: "cloud_monitoring" } },
//             { id: "cloud_logging",    data: { label: "Logging",    icon: "cloud_logging" } },
//             { id: "cloud_trace",      data: { label: "Trace",      icon: "cloud_trace" } },
//             { id: "profiler",         data: { label: "Profiler",   icon: "stackdriver_profiler" } }
//           ]
//         }
//       ],

//       /* Cross-layer edges inside GCP group */
//       edges: [
//         { id: "e_lb_gw",     sources: ["lb_https"], targets: ["api_gw"],       labels: [{ text: "HTTPS" }] },
//         { id: "e_gw_catalog",sources: ["api_gw"],   targets: ["catalog_svc"],  labels: [{ text: "REST"  }] },
//         { id: "e_gw_order",  sources: ["api_gw"],   targets: ["order_svc"],    labels: [{ text: "REST"  }] },
//         { id: "e_order_flow",sources: ["order_svc"],targets: ["workflows"],    labels: [{ text: "Invoke" }] },
//         { id: "e_flow_risk", sources: ["workflows"],targets: ["risk_svc"],     labels: [{ text: "Branch" }] },
//         { id: "e_flow_topic",sources: ["workflows"],targets: ["order_topic"],  labels: [{ text: "Publish" }] },
//         { id: "e_catalog_db",sources: ["catalog_svc"],targets: ["spanner"],    labels: [{ text: "Read" }] },
//         { id: "e_order_db",  sources: ["order_svc"],targets: ["spanner"],      labels: [{ text: "Write" }] },
//         { id: "e_risk_db",   sources: ["risk_svc"], targets: ["spanner"],      labels: [{ text: "Read" }] },
//         { id: "e_catalog_fs",sources: ["catalog_svc"],targets: ["firestore"],  labels: [{ text: "Update stock" }] },
//         { id: "e_order_cache",sources: ["order_svc"],targets: ["redis"],       labels: [{ text: "Session" }] }
//       ]
//     },

//     /* ─────────────────────── 3. EXTERNAL ─────────────────────── */
//     {
//       id: "external",
//       data: {
//         label: "External Services",
//         icon: "third_party_api",
//         style: STYLES.GREEN
//       },
//       children: [
//         { id: "payment_gateway", data: { label: "Payment Gateway", icon: "payment_gateway" } },
//         { id: "email_service",   data: { label: "Email SMTP",      icon: "notification_service" } }
//       ]
//     }
//   ],

//   /* Root-level edges */
//   edges: [
//     { id: "e_web_cdn",    sources: ["web_user"],    targets: ["cloud_cdn"],     labels: [{ text: "HTTPS" }] },
//     { id: "e_mobile_cdn", sources: ["mobile_user"], targets: ["cloud_cdn"],     labels: [{ text: "HTTPS" }] },
//     { id: "e_gw_pay",     sources: ["order_svc"],   targets: ["payment_gateway"],labels: [{ text: "Charge" }] },
//     { id: "e_flow_email", sources: ["workflows"],   targets: ["email_service"], labels: [{ text: "Notify" }] }
//   ]
// });
