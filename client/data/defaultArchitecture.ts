export const DEFAULT_ARCHITECTURE = {
  "id": "root",
  "children": [
    {
      "id": "external_clients",
      "labels": [{ "text": "external_clients" }],
      "children": [
        {
          "id": "external_client",
          "labels": [{ "text": "Supercalifragilisticexpialidocious" }],
          "children": [],
          "edges": [],
          "data": { "icon": "browser_client" }
        }
      ],
      "edges": []
    },
    {
      "id": "gcp_env",
      "labels": [{ "text": "GCP" }],
      "children": [
        {
          "id": "api_gateway",
          "labels": [{ "text": "api_gateway" }],
          "children": [
            {
              "id": "cloud_lb",
              "labels": [{ "text": "This is a very long sentence that should wrap across multiple lines to test our text wrapping capabilities" }],
              "children": [],
              "edges": [],
              "data": { "icon": "gcp_cloud_load_balancing" }
            },
            {
              "id": "cloud_armor",
              "labels": [{ "text": "A" }],
              "children": [],
              "edges": [],
              "data": { "icon": "gcp_cloud_armor" }
            },
            {
              "id": "certificate_manager",
              "labels": [{ "text": "API-Gateway-v2.1-Enterprise-Edition" }],
              "children": [],
              "edges": [],
              "data": { "icon": "gcp_certificate_manager" }
            },
            {
              "id": "cloud_cdn",
              "labels": [{ "text": "123456789012345678901234567890" }],
              "children": [],
              "edges": [],
              "data": { "icon": "gcp_cloud_cdn" }
            }
          ],
          "edges": [
            {
              "id": "edge_cdn_lb",
              "sources": ["cloud_cdn"],
              "targets": ["cloud_lb"],
              "labels": [{ "text": "caches" }]
            },
            {
              "id": "edge_armor_lb",
              "sources": ["cloud_armor"],
              "targets": ["cloud_lb"],
              "labels": [{ "text": "protects" }]
            },
            {
              "id": "edge_cert_lb",
              "sources": ["certificate_manager"],
              "targets": ["cloud_lb"],
              "labels": [{ "text": "manages" }]
            }
          ]
        },
        {
          "id": "gateway_mgmt",
          "labels": [{ "text": "gateway_mgmt" }],
          "children": [
            {
              "id": "cloud_dns",
              "labels": [{ "text": "Cloud DNS" }],
              "children": [],
              "edges": [],
              "data": { "icon": "gcp_cloud_dns" }
            },
            {
              "id": "gke_gateway_controller",
              "labels": [{ "text": "Antidisestablishmentarianism Service Controller" }],
              "children": [],
              "edges": [],
              "data": {}
            },
            {
              "id": "k8s_gateway_api",
              "labels": [{ "text": "Special-Characters@#$%^&*()_+{}|:<>?[]\\;'\",./" }],
              "children": [],
              "edges": [],
              "data": {}
            }
          ],
          "edges": []
        },
        {
          "id": "service_mesh",
          "labels": [{ "text": "service_mesh" }],
          "children": [
            {
              "id": "service_mesh_c1",
              "labels": [{ "text": "service_mesh_c1" }],
              "children": [
                {
                  "id": "cluster1",
                  "labels": [{ "text": "cluster1" }],
                  "children": [],
                  "edges": [],
                  "data": {}
                },
                {
                  "id": "anthos_svc1_c1",
                  "labels": [{ "text": "Service 1 (Cluster1)" }],
                  "children": [],
                  "edges": [],
                  "data": {}
                },
                {
                  "id": "anthos_svc2_c1",
                  "labels": [{ "text": "Service 2 (Cluster1)" }],
                  "children": [],
                  "edges": [],
                  "data": {}
                }
              ],
              "edges": [
                {
                  "id": "edge_svc1_c1_svc2_c1",
                  "sources": ["anthos_svc1_c1"],
                  "targets": ["anthos_svc2_c1"],
                  "labels": [{ "text": "calls" }]
                }
              ]
            },
            {
              "id": "service_mesh_c2",
              "labels": [{ "text": "service_mesh_c2" }],
              "children": [
                {
                  "id": "cluster2",
                  "labels": [{ "text": "cluster2" }],
                  "children": [],
                  "edges": [],
                  "data": {}
                },
                {
                  "id": "anthos_svc1_c2",
                  "labels": [{ "text": "Service 1 (Cluster2)" }],
                  "children": [],
                  "edges": [],
                  "data": {}
                },
                {
                  "id": "anthos_svc2_c2",
                  "labels": [{ "text": "Service 2 (Cluster2)" }],
                  "children": [],
                  "edges": [],
                  "data": {}
                }
              ],
              "edges": [
                {
                  "id": "edge_svc1_c2_svc2_c2",
                  "sources": ["anthos_svc1_c2"],
                  "targets": ["anthos_svc2_c2"],
                  "labels": [{ "text": "calls" }]
                }
              ]
            }
          ],
          "edges": [
            {
              "id": "edge_svc1_c1_svc1_c2",
              "sources": ["anthos_svc1_c1"],
              "targets": ["anthos_svc1_c2"],
              "labels": [{ "text": "syncs" }]
            },
            {
              "id": "edge_svc1_c1_svc2_c2",
              "sources": ["anthos_svc1_c1"],
              "targets": ["anthos_svc2_c2"],
              "labels": [{ "text": "communicates" }]
            },
            {
              "id": "edge_svc2_c2_svc1_c1",
              "sources": ["anthos_svc2_c2"],
              "targets": ["anthos_svc1_c1"],
              "labels": [{ "text": "communicates" }]
            },
            {
              "id": "edge_svc1_c2_svc2_c1",
              "sources": ["anthos_svc1_c2"],
              "targets": ["anthos_svc2_c1"],
              "labels": [{ "text": "communicates" }]
            },
            {
              "id": "edge_svc2_c1_svc2_c2",
              "sources": ["anthos_svc2_c1"],
              "targets": ["anthos_svc2_c2"],
              "labels": [{ "text": "syncs" }]
            },
            {
              "id": "edge_svc2_c1_svc1_c2",
              "sources": ["anthos_svc2_c1"],
              "targets": ["anthos_svc1_c2"],
              "labels": [{ "text": "communicates" }]
            }
          ]
        },
        {
          "id": "api_and_auth",
          "labels": [{ "text": "api_and_auth" }],
          "children": [
            {
              "id": "api_gw",
              "labels": [{ "text": "API Gateway" }],
              "children": [],
              "edges": [],
              "data": {}
            },
            {
              "id": "iap",
              "labels": [{ "text": "Identity-Aware Proxy" }],
              "children": [],
              "edges": [],
              "data": {}
            }
          ],
          "edges": [
            {
              "id": "e_iap_to_apigw",
              "sources": ["iap"],
              "targets": ["api_gw"],
              "labels": [{ "text": "authenticates" }]
            }
          ]
        }
      ],
      "edges": [
        {
          "id": "edge_dns_lb",
          "sources": ["cloud_dns"],
          "targets": ["cloud_lb"],
          "labels": [{ "text": "resolves" }]
        },
        {
          "id": "edge_gkeconf_lb",
          "sources": ["gke_gateway_controller"],
          "targets": ["cloud_lb"],
          "labels": [{ "text": "configures" }]
        },
        {
          "id": "edge_k8s_svc1_c1",
          "sources": ["k8s_gateway_api"],
          "targets": ["anthos_svc1_c1"],
          "labels": [{ "text": "routes" }]
        },
        {
          "id": "edge_k8s_svc1_c2",
          "sources": ["k8s_gateway_api"],
          "targets": ["anthos_svc1_c2"],
          "labels": [{ "text": "routes" }]
        },
        {
          "id": "e_lb_to_apigw",
          "sources": ["cloud_lb"],
          "targets": ["api_gw"],
          "labels": [{ "text": "routes" }]
        }
      ],
      "data": {}
    },
    {
      "id": "root_gcp",
      "labels": [{ "text": "Google Cloud" }],
      "children": [],
      "edges": [],
      "data": {}
    },
    {
      "id": "users",
      "labels": [{ "text": "users" }],
      "children": [
        {
          "id": "web_client",
          "labels": [{ "text": "Multi Word Test Case With Many Words" }],
          "children": [],
          "edges": [],
          "data": {}
        },
        {
          "id": "mobile_client",
          "labels": [{ "text": "" }],
          "children": [],
          "edges": [],
          "data": {}
        }
      ],
      "edges": []
    }
  ],
  "edges": [
    {
      "id": "edge_client_lb",
      "sources": ["external_client"],
      "targets": ["cloud_lb"],
      "labels": [{ "text": "requests" }]
    }
  ]
};
