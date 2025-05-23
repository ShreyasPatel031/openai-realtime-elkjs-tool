import { RawGraph } from "./types/index";
import { STYLES }   from "./styles";

// /**
//  * Real-Time Stream Processing (IoT) – Google Cloud reference
//  */
export const getInitialGraph = (): RawGraph => ({
  id: "root",

  // /* ───────────────────────────── children ───────────────────────────── */
  children: [

    // /* ───────── 1. edge devices ───────── */
    // {
    //   id: "devices",
    //   data: {
    //     label: "Edge Devices",
    //     icon : "browser_client",
    //     style: STYLES.GREEN
    //   },
    //   children: [
    //     { id: "iot_device", data: { label: "IoT Device", icon: "iot_core" } },
    //     { id: "gateway",    data: { label: "Gateway",    icon: "vpn_gateway_generic" } }
    //   ],
    //   edges: [
    //     {
    //       id     : "e_device_gateway",
    //       sources: ["iot_device"],
    //       targets: ["gateway"],
    //       labels : [{ text: "send telemetry" }]
    //     }
    //   ]
    // },

    // /* ───────── 2. Google Cloud Platform ───────── */
    // {
    //   id: "gcp",
    //   data: {
    //     label: "Google Cloud Platform",
    //     icon : "gcp_logo",
    //     style: STYLES.BLUE
    //   },

    //   /* nested groups --------------------------------------------------- */
    //   children: [

    //     /* 2-A. Pub/Sub ingest */
    //     {
    //       id: "messaging",
    //       data: {
    //         label: "Messaging",
    //         icon : "pubsub",
    //         style: STYLES.YELLOW
    //       },
    //       children: [
    //         { id: "pubsub", data: { label: "Cloud Pub/Sub", icon: "pubsub" } }
    //       ]
    //     },

    //     /* 2-B. Observability */
    //     {
    //       id: "observability",
    //       data: {
    //         label: "Observability",
    //         icon : "cloud_monitoring",
    //         style: STYLES.GREY
    //       },
    //       children: [
    //         { id: "cloud_monitoring", data: { label: "Cloud Monitoring", icon: "cloud_monitoring" } },
    //         { id: "cloud_logging",    data: { label: "Cloud Logging",    icon: "cloud_logging"     } }
    //       ],
    //       edges: [
    //         {
    //           id     : "e_monitoring_logging",
    //           sources: ["cloud_monitoring"],
    //           targets: ["cloud_logging"],
    //           labels : [{ text: "export metrics" }]
    //         }
    //       ]
    //     },

    //     /* 2-C. Data-flow pipeline */
    //     {
    //       id: "etl_pipeline",
    //       data: {
    //         label: "Data Pipelines",
    //         icon : "dataflow",
    //         style: STYLES.PURPLE
    //       },
    //       children: [
    //         { id: "dataflow", data: { label: "Cloud Dataflow", icon: "dataflow" } }
    //       ]
    //     },

    //     /* 2-D. Storage */
    //     {
    //       id: "storage",
    //       data: {
    //         label: "Storage",
    //         icon : "cloud_storage",
    //         style: STYLES.GREEN
    //       },
    //       children: [
    //         { id: "cloud_storage",   data: { label: "Cloud Storage",  icon: "cloud_storage"   } },
    //         { id: "cloud_datastore", data: { label: "Cloud Datastore",icon: "cloud_datastore" } },
    //         { id: "cloud_bigtable",  data: { label: "Cloud Bigtable", icon: "bigtable"        } }
    //       ]
    //     },

    //     /* 2-E. Analytics */
    //     {
    //       id: "analytics",
    //       data: {
    //         label: "Analytics",
    //         icon : "bigquery",
    //         style: STYLES.TEAL
    //       },
    //       children: [
    //         { id: "bigquery", data: { label: "BigQuery",      icon: "bigquery"    } },
    //         { id: "dataproc", data: { label: "Cloud Dataproc", icon: "dataproc"    } },
    //         { id: "datalab",  data: { label: "Cloud Datalab",  icon: "cloud_datalab" } }
    //       ]
    //     },

    //     /* 2-F. Application & presentation */
    //     {
    //       id: "compute",
    //       data: {
    //         label: "Application & Presentation",
    //         icon : "app_engine",
    //         style: STYLES.GREY
    //       },
    //       children: [
    //         { id: "app_engine",      data: { label: "App Engine",      icon: "app_engine"      } },
    //         { id: "container_engine",data: { label: "Container Engine",icon: "gke_autopilot"   } },
    //         { id: "compute_engine",  data: { label: "Compute Engine",  icon: "compute_engine"  } }
    //       ]
    //     }
    //   ],

    //   /* edges inside the GCP super-group -------------------------------- */
    //   edges: [
    //     /* ingest → pipeline */
    //     {
    //       id:"e_pubsub_dataflow",
    //       sources:["pubsub"],
    //       targets:["dataflow"],
    //       labels:[{ text:"stream ingest" }]
    //     },

    //     /* pipeline → storage */
    //     { id:"e_dataflow_storage",   sources:["dataflow"], targets:["cloud_storage"],   labels:[{ text:"write" }] },
    //     { id:"e_dataflow_datastore", sources:["dataflow"], targets:["cloud_datastore"], labels:[{ text:"write" }] },
    //     { id:"e_dataflow_bigtable",  sources:["dataflow"], targets:["cloud_bigtable"],  labels:[{ text:"write" }] },

    //     /* pipeline → analytics */
    //     { id:"e_dataflow_bigquery", sources:["dataflow"], targets:["bigquery"], labels:[{ text:"stream"  }] },
    //     { id:"e_dataflow_dataproc", sources:["dataflow"], targets:["dataproc"], labels:[{ text:"trigger" }] },
    //     { id:"e_dataflow_datalab",  sources:["dataflow"], targets:["datalab"],  labels:[{ text:"feed"    }] },

    //     /* logging → analytics */
    //     { id:"e_logging_bigquery", sources:["cloud_logging"], targets:["bigquery"], labels:[{ text:"export logs" }] },

    //     /* analytics → presentation */
    //     { id:"e_bigquery_appengine", sources:["bigquery"], targets:["app_engine"],      labels:[{ text:"serve insights" }] },
    //     { id:"e_bigquery_container", sources:["bigquery"], targets:["container_engine"],labels:[{ text:"serve insights" }] },
    //     { id:"e_bigquery_compute",   sources:["bigquery"], targets:["compute_engine"],  labels:[{ text:"serve insights" }] }
    //   ]
    // }
  ],

  // /* ───────────────────────────── root-level edges ───────────────────────────── */
  edges: [
    // {
    //   id     : "e_gateway_pubsub",
    //   sources: ["gateway"],
    //   targets: ["pubsub"],
    //   labels : [{ text: "streams data" }]
    // }
  ]
});

// /**
//  * Export an alias for getInitialGraph as getInitialElkGraph 
//  * for compatibility with components that import it
//  */
export const getInitialElkGraph = getInitialGraph;
