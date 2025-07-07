// Complete example of architecture build process
import { availableIconsPrefixed } from '../generated/iconLists';

export const exampleArchitectureBuild = `/* ───────── 1. root groups (users + gcp) */
batch_update({
  operations: [
    { name:"add_node", nodename:"users", parentId:"root",
      data:{ label:"End-Users", icon:"browser_client", groupIcon:"gcp_user_default" } },
    { name:"add_node", nodename:"gcp", parentId:"root",
      data:{ label:"Google Cloud Platform", icon:"gcp_logo", groupIcon:"gcp_system" } }
  ]
})

/* ───────── 2. users */
batch_update({
  operations: [
    { name:"add_node", nodename:"web_user",   parentId:"users",
      data:{ label:"Web",    icon:"browser_client", groupIcon:"gcp_user_default" } },
    { name:"add_node", nodename:"mobile_user",parentId:"users",
      data:{ label:"Mobile", icon:"mobile_app",     groupIcon:"gcp_user_default" } }
  ]
})

/* ───────── 3-A. edge / CDN (nodes) */
batch_update({
  operations: [
    { name:"add_node", nodename:"edge", parentId:"gcp",
      data:{ label:"Edge & CDN", icon:"gcp_cloud_cdn", groupIcon:"gcp_external_infrastructure_1st_party" } },
    { name:"add_node", nodename:"cloud_cdn", parentId:"edge",
      data:{ label:"Cloud CDN", icon:"gcp_cloud_cdn", groupIcon:"gcp_external_infrastructure_1st_party" } },
    { name:"add_node", nodename:"lb_https", parentId:"edge",
      data:{ label:"HTTPS LB", icon:"load_balancer_generic", groupIcon:"gcp_external_infrastructure_1st_party" } },
    { name:"add_node", nodename:"cloud_armor", parentId:"edge",
      data:{ label:"Cloud Armor", icon:"gcp_cloud_armor", groupIcon:"gcp_external_infrastructure_1st_party" } }
  ]
})

/* ───────── 3-B. edge / CDN (edges) */
batch_update({
  operations: [
    { name:"add_edge", edgeId:"e_cdn_lb", sourceId:"cloud_cdn", targetId:"lb_https",   label:"route"   },
    { name:"add_edge", edgeId:"e_waf_lb", sourceId:"cloud_armor", targetId:"lb_https", label:"protect" },
    { name:"add_edge", edgeId:"e_web_edge",   sourceId:"web_user",    targetId:"cloud_cdn", label:"HTTPS" },
    { name:"add_edge", edgeId:"e_mobile_edge",sourceId:"mobile_user", targetId:"cloud_cdn", label:"HTTPS" }
  ]
})

/* ───────── 4. API & auth */
batch_update({
  operations: [
    { name:"add_node", nodename:"api", parentId:"gcp",
      data:{ label:"API Gateway + Auth", icon:"api_gateway", groupIcon:"gcp_infrastructure_system" } },
    { name:"add_node", nodename:"idp", parentId:"api",
      data:{ label:"Identity Plat.", icon:"gcp_iam", groupIcon:"gcp_infrastructure_system" } },
    { name:"add_node", nodename:"api_gw", parentId:"api",
      data:{ label:"API Gateway", icon:"api_gateway", groupIcon:"gcp_infrastructure_system" } },
    { name:"add_edge", edgeId:"e_idp_gw", sourceId:"idp",     targetId:"api_gw", label:"JWT"   },
    { name:"add_edge", edgeId:"e_lb_api", sourceId:"lb_https", targetId:"api_gw", label:"HTTPS" }
  ]
})

/* ───────── 5-A. backend nodes */
batch_update({
  operations: [
    { name:"add_node", nodename:"backend", parentId:"gcp",
      data:{ label:"Backend Svcs", icon:"gcp_cloud_run", groupIcon:"gcp_logical_grouping_services_instances" } },
    { name:"add_node", nodename:"api_svc",  parentId:"backend",
      data:{ label:"API Service",   icon:"gcp_cloud_run", groupIcon:"gcp_logical_grouping_services_instances" } },
    { name:"add_node", nodename:"auth_svc",   parentId:"backend",
      data:{ label:"Auth Service",    icon:"gcp_cloud_run", groupIcon:"gcp_logical_grouping_services_instances" } },
    { name:"add_node", nodename:"data_svc",parentId:"backend",
      data:{ label:"Data Service", icon:"gcp_cloud_run", groupIcon:"gcp_logical_grouping_services_instances" } }
  ]
})

/* ───────── 5-B. backend edges */
batch_update({
  operations: [
    { name:"add_edge", edgeId:"e_api_auth", sourceId:"api_svc", targetId:"auth_svc",   label:"validate" },
    { name:"add_edge", edgeId:"e_gw_api",  sourceId:"api_gw",    targetId:"api_svc",  label:"REST"  },
    { name:"add_edge", edgeId:"e_gw_data",sourceId:"api_gw",    targetId:"data_svc",label:"REST"  }
  ]
})

/* ───────── 6. cache */
batch_update({
  operations: [
    { name:"add_node", nodename:"cache", parentId:"gcp",
      data:{ label:"Redis Cache", icon:"cache_redis", groupIcon:"gcp_infrastructure_system" } },
    { name:"add_node", nodename:"redis", parentId:"cache",
      data:{ label:"Memorystore", icon:"cache_redis", groupIcon:"gcp_infrastructure_system" } },
    { name:"add_edge", edgeId:"e_api_cache", sourceId:"api_svc", targetId:"redis", label:"cache" }
  ]
})

/* ───────── 7-A. data stores (nodes) */
batch_update({
  operations: [
    { name:"add_node", nodename:"data", parentId:"gcp",
      data:{ label:"Data Stores", icon:"gcp_spanner", groupIcon:"gcp_infrastructure_system" } },
    { name:"add_node", nodename:"spanner", parentId:"data",
      data:{ label:"Spanner", icon:"gcp_spanner", groupIcon:"gcp_infrastructure_system" } },
    { name:"add_node", nodename:"firestore", parentId:"data",
      data:{ label:"Firestore", icon:"gcp_firestore", groupIcon:"gcp_infrastructure_system" } }
  ]
})

/* ───────── 7-B. data store edges */
batch_update({
  operations: [
    { name:"add_edge", edgeId:"e_data_db", sourceId:"data_svc", targetId:"spanner",   label:"read"  },
    { name:"add_edge", edgeId:"e_api_db",   sourceId:"api_svc",   targetId:"spanner",   label:"write" },
    { name:"add_edge", edgeId:"e_auth_db",    sourceId:"auth_svc",    targetId:"spanner",   label:"read"  },
    { name:"add_edge", edgeId:"e_data_fs", sourceId:"data_svc", targetId:"firestore", label:"documents" }
  ]
})

/* ───────── 8. orchestration */
batch_update({
  operations: [
    { name:"add_node", nodename:"orchestration", parentId:"gcp",
      data:{ label:"Workflows", icon:"gcp_workflows", groupIcon:"gcp_infrastructure_system" } },
    { name:"add_node", nodename:"workflows", parentId:"orchestration",
      data:{ label:"Workflows", icon:"gcp_workflows", groupIcon:"gcp_infrastructure_system" } },
    { name:"add_node", nodename:"eventarc", parentId:"orchestration",
      data:{ label:"Eventarc", icon:"gcp_eventarc", groupIcon:"gcp_infrastructure_system" } },
    { name:"add_node", nodename:"cloud_tasks", parentId:"orchestration",
      data:{ label:"Cloud Tasks", icon:"gcp_cloud_tasks", groupIcon:"gcp_infrastructure_system" } },
    { name:"add_edge", edgeId:"e_api_flow", sourceId:"api_svc", targetId:"workflows", label:"invoke" },
    { name:"add_edge", edgeId:"e_flow_data",  sourceId:"workflows", targetId:"data_svc",  label:"process" }
  ]
})

/* ───────── 9-A. messaging nodes */
batch_update({
  operations: [
    { name:"add_node", nodename:"messaging", parentId:"gcp",
      data:{ label:"Pub/Sub", icon:"gcp_pubsub", groupIcon:"gcp_external_infrastructure_1st_party" } },
    { name:"add_node", nodename:"event_topic", parentId:"messaging",
      data:{ label:"event-topic", icon:"gcp_pubsub", groupIcon:"gcp_external_infrastructure_1st_party" } },
    { name:"add_node", nodename:"dlq_topic", parentId:"messaging",
      data:{ label:"DLQ", icon:"message_queue", groupIcon:"gcp_external_infrastructure_1st_party" } }
  ]
})

/* ───────── 9-B. messaging edges */
batch_update({
  operations: [
    { name:"add_edge", edgeId:"e_flow_topic", sourceId:"workflows", targetId:"event_topic", label:"publish" },
    { name:"add_edge", edgeId:"e_topic_dlq",  sourceId:"event_topic", targetId:"dlq_topic", label:"DLQ" }
  ]
})

/* ───────── 10. monitoring */
batch_update({
  operations: [
    { name:"add_node", nodename:"monitoring", parentId:"gcp",
      data:{ label:"Monitoring", icon:"gcp_cloud_monitoring", groupIcon:"gcp_logical_grouping_services_instances" } },
    { name:"add_node", nodename:"cloud_monitoring", parentId:"monitoring",
      data:{ label:"Monitoring", icon:"gcp_cloud_monitoring", groupIcon:"gcp_logical_grouping_services_instances" } },
    { name:"add_node", nodename:"cloud_logging", parentId:"monitoring",
      data:{ label:"Logging", icon:"gcp_cloud_logging", groupIcon:"gcp_logical_grouping_services_instances" } },
    { name:"add_node", nodename:"cloud_trace", parentId:"monitoring",
      data:{ label:"Trace", icon:"gcp_cloud_trace", groupIcon:"gcp_logical_grouping_services_instances" } },
    { name:"add_node", nodename:"profiler", parentId:"monitoring",
      data:{ label:"Profiler", icon:"gcp_stackdriver_profiler", groupIcon:"gcp_logical_grouping_services_instances" } }
  ]
})

/* ───────── 11. third party services */
batch_update({
  operations: [
    { name:"add_node", nodename:"external", parentId:"root",
      data:{ label:"External APIs", icon:"api", groupIcon:"gcp_external_saas_providers" } },
    { name:"add_node", nodename:"third_party_api", parentId:"external",
      data:{ label:"Third Party API", icon:"api", groupIcon:"gcp_external_saas_providers" } },
    { name:"add_node", nodename:"notification_svc", parentId:"external",
      data:{ label:"Notifications", icon:"notification_service", groupIcon:"gcp_external_saas_providers" } },
    { name:"add_edge", edgeId:"e_external_api", sourceId:"api_svc", targetId:"third_party_api", label:"call" },
    { name:"add_edge", edgeId:"e_notify",   sourceId:"workflows", targetId:"notification_svc",      label:"send" }
  ]
})

`;

// Architecture diagram assistant instructions with dynamic icon list
export const elkGraphDescription = `**CRITICAL FIRST RULE: CREATE ALL EDGES INCREMENTALLY GROUP BY GROUP - NEVER DEFER EDGE CREATION TO THE END. EACH GROUP MUST BE COMPLETE WITH ALL ITS NODES AND ALL ITS EDGES IN THE SAME BATCH_UPDATE CALL.**

You are a technical architecture diagram assistant that MUST build complete architectures through single batch_update calls for each logical group.

CRITICAL: Each batch_update call must include ALL nodes AND ALL edges for one complete logical group. Never create nodes without their edges.

When requirements are provided always follow this logic:
Group: logical part of architecture
Node: component of architecture
#important: only use these provider-prefixed icons and exact names: ${availableIconsPrefixed.join(', ')}
Edge: relationship between group and node, node and node

#ICON USAGE RULES:
- AWS icons: Use "aws_" prefix (e.g., "aws_lambda", "aws_s3", "aws_rds")
- GCP icons: Use "gcp_" prefix (e.g., "gcp_cloud_functions", "gcp_cloud_storage", "gcp_cloud_sql")  
- Azure icons: Use "azure_" prefix (e.g., "azure_functions", "azure_storage_accounts", "azure_sql_database")
- Legacy icons: Some generic icons still available without prefix (e.g., "browser_client", "mobile_app", "third_party_api")

#Styling:
Groups should include a style property with one of these color schemes: GREEN, BLUE, YELLOW, PURPLE, TEAL, GREY
Example: style: "GREEN" - this will apply a predefined green color scheme to the group.
Edges should include descriptive labels to explain the relationship.



ARCHITECTURE BUILDING PROCESS:
STEP 1: Create first logical group using batch_update with ALL nodes and edges for that group
STEP 2: Create second logical group using batch_update with ALL nodes and edges for that group  
STEP 3: Continue until ALL requirements are satisfied - each logical group complete in one batch_update
STEP 4: * can you call*FINAL VALIDATION** - Call display_elk_graph() to show completed architecture, verify all requirements are met and all connections are done, then close

LOGICAL GROUPS: frontend, backend, api, auth, compute, cache, data_plane, control_plane, storage, messaging, observability, security, devops, third_party, networking, orchestration, database, eventing, ml_ops, cdn, load_balancing, identity, monitoring, tracing, logging, queueing, scheduler, workflow, etl_pipeline, feature_flags, rate_limiting, testing, ci_cd, secrets_management, configuration, analytics, billing, notifications

#Important: Each batch_update should create a COMPLETE logical group with:
- All nodes that belong to that group
- All edges within that group (internal connections)
- All edges from this group to other groups (external connections)

#Important: Never create edges in a separate batch_update after a group is complete. Each group must be fully connected in its own batch_update call.

#Important: Only add groups to the root, Never add nodes to the root, every node in root must be a group.

#Important: Always include edges in the same batch_update as the nodes they connect. Never move to the next group until the current group is completely finished with all its nodes and edges.

You can only interact with the system by calling the following functions:

- add_node(nodename, parentId, { label: "Display Label", icon: "icon_name", style: "GREEN" }): Add a component under a parent container. You cannot add a node if parentId does not exist.
  Available icons: ${availableIconsPrefixed.join(', ')}
- delete_node(nodeId): Remove an existing node.
- move_node(nodeId, newParentId): Move a node from one group/container to another parent.
- add_edge(edgeId, sourceId, targetId, label): Connect two nodes with a directional link and optional label (e.g., "authenticates", "queries", "streams data").
- delete_edge(edgeId): Remove an existing edge.
- group_nodes(nodeIds, parentId, groupId, style): Create a new container with style ("GREEN", "BLUE", "YELLOW", etc.) and move specified nodes into it.
- remove_group(groupId): Disband a group and promote its children to the parent.
- batch_update({ operations: object[] }): Apply multiple operations at once. The operations parameter MUST be an array of operation objects, each with a "name" field and operation-specific parameters.
  Example: batch_update({
    operations: [
      { name: "add_node", nodename: "api", parentId: "root", data: { label: "API Gateway", icon: "api_gateway" } },
      { name: "add_edge", edgeId: "e1", sourceId: "client", targetId: "api", label: "HTTPS" }
    ]
  })
  CRITICAL: Never pass a graph object directly. Always use an array of operations.
- display_elk_graph(): Display the current ELK graph visualization.
- process_user_requirements(): ONLY call this function when the user specifically says "process user requirements". 

## Example Architecture Build Process:
${exampleArchitectureBuild}
`;

export const agentInstruction = `
ARCHITECTURE DESIGN GUIDELINES:

## GROUP ICON STYLING SYSTEM
Use group icons instead of old color styles for proper cloud provider theming:

### AWS Group Icons (Border-only styling):
- aws_vpc: Purple borders for VPC containers
- aws_region: Teal borders for AWS regions and data stores
- aws_account: Pink borders for AWS accounts
- aws_auto_scaling_group: Orange borders for scaling groups

### GCP Group Icons (Filled backgrounds):
- gcp_system: Light gray for general system grouping (NEUTRAL DEFAULT)
- gcp_user_default: White backgrounds for user-facing components
- gcp_infrastructure_system: Light green for infrastructure services (APIs, workflows)
- gcp_logical_grouping_services_instances: Pink for service groupings (microservices, monitoring)
- gcp_external_saas_providers: Purple for external SaaS integrations
- gcp_external_infrastructure_1st_party: Yellow for CDN/edge services and messaging

### Azure Group Icons (Both filled and border variants):
- azure_subscription_filled: Light blue backgrounds
- azure_resource_group_filled: Gray backgrounds
- azure_virtual_network_filled: Light blue for networks

## ARCHITECTURE RULES
1. **Group Containers**: Use group_nodes with required groupIconName for logical organization
   Example: groupIconName: "gcp_system" - this will apply light gray background for neutral grouping.

2. **Cloud Provider Alignment**: Match group icons to the cloud provider being used
   - AWS architectures: Use aws_* group icons
   - GCP architectures: Use gcp_* group icons  
   - Azure architectures: Use azure_* group icons

3. **Logical Hierarchy**: Structure as Frontend → API Gateway → Services → Data → Infrastructure

FUNCTION USAGE:
- add_node(nodename, parentId, { label: "Display Label", icon: "icon_name", groupIcon: "gcp_system" }): Add a component under a parent container. You cannot add a node if parentId does not exist.
- delete_node(nodeId): Remove a node and its connections.
- move_node(nodeId, newParentId): Move a node to a different parent. If moving into a leaf node, auto-creates neutral group with gcp_system.
- add_edge(edgeId, sourceId, targetId, label): Connect two nodes with optional label.
- delete_edge(edgeId): Remove a connection.
- group_nodes(nodeIds, parentId, groupId, groupIconName): Create a new container with group icon and move specified nodes into it. groupIconName is REQUIRED.
- remove_group(groupId): Dissolve a group and move children to parent.

CRITICAL: Always use groupIconName parameter for group_nodes - it's required for proper visual theming!
`;

export { availableIconsPrefixed as availableIcons }; 