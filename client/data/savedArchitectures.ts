// Saved architecture variations for testing
export const SAVED_ARCHITECTURES = {
  'current': {
    id: 'current',
    name: 'Current GCP Architecture',
    timestamp: new Date(),
    rawGraph: {
      "id": "root",
      "children": [
        {
          "id": "external_clients",
          "labels": [{"text": "external_clients"}],
          "children": [
            {
              "id": "external_client",
              "labels": [{"text": "External Client"}],
              "children": [],
              "edges": [],
              "data": {"icon": "browser_client"}
            }
          ],
          "edges": []
        },
        {
          "id": "gcp_env",
          "labels": [{"text": "GCP"}],
          "children": [
            {
              "id": "api_gateway",
              "labels": [{"text": "api_gateway"}],
              "children": [
                {
                  "id": "cloud_lb",
                  "labels": [{"text": "Cloud Load Balancing"}],
                  "children": [],
                  "edges": [],
                  "data": {"icon": "gcp_cloud_load_balancing"}
                },
                {
                  "id": "cloud_armor",
                  "labels": [{"text": "Cloud Armor"}],
                  "children": [],
                  "edges": [],
                  "data": {"icon": "gcp_cloud_armor"}
                }
              ],
              "edges": []
            },
            {
              "id": "compute_services",
              "labels": [{"text": "Compute Services"}],
              "children": [
                {
                  "id": "compute_engine",
                  "labels": [{"text": "Compute Engine"}],
                  "children": [],
                  "edges": [],
                  "data": {"icon": "gcp_compute_engine"}
                },
                {
                  "id": "cloud_functions",
                  "labels": [{"text": "Cloud Functions"}],
                  "children": [],
                  "edges": [],
                  "data": {"icon": "gcp_cloud_functions"}
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
              "labels": [{"text": "requests"}]
            }
          ]
        }
      ],
      "edges": []
    }
  },

  'aws-replica': {
    id: 'aws-replica',
    name: 'AWS Cloud Infrastructure',
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
    rawGraph: {
      "id": "root",
      "children": [
        {
          "id": "external_clients",
          "labels": [{"text": "external_clients"}],
          "children": [
            {
              "id": "external_client",
              "labels": [{"text": "External Client"}],
              "children": [],
              "edges": [],
              "data": {"icon": "browser_client"}
            }
          ],
          "edges": []
        },
        {
          "id": "aws_env",
          "labels": [{"text": "AWS"}],
          "children": [
            {
              "id": "api_gateway",
              "labels": [{"text": "API Gateway"}],
              "children": [
                {
                  "id": "alb",
                  "labels": [{"text": "Application Load Balancer"}],
                  "children": [],
                  "edges": [],
                  "data": {"icon": "aws_elastic_load_balancing"}
                },
                {
                  "id": "waf",
                  "labels": [{"text": "AWS WAF"}],
                  "children": [],
                  "edges": [],
                  "data": {"icon": "aws_waf"}
                }
              ],
              "edges": []
            },
            {
              "id": "compute_services",
              "labels": [{"text": "Compute Services"}],
              "children": [
                {
                  "id": "ec2",
                  "labels": [{"text": "EC2 Instances"}],
                  "children": [],
                  "edges": [],
                  "data": {"icon": "aws_ec2"}
                },
                {
                  "id": "lambda",
                  "labels": [{"text": "Lambda Functions"}],
                  "children": [],
                  "edges": [],
                  "data": {"icon": "aws_lambda"}
                }
              ],
              "edges": []
            },
            {
              "id": "storage_services",
              "labels": [{"text": "Storage"}],
              "children": [
                {
                  "id": "s3",
                  "labels": [{"text": "S3 Bucket"}],
                  "children": [],
                  "edges": [],
                  "data": {"icon": "aws_s3"}
                },
                {
                  "id": "rds",
                  "labels": [{"text": "RDS Database"}],
                  "children": [],
                  "edges": [],
                  "data": {"icon": "aws_rds"}
                }
              ],
              "edges": []
            }
          ],
          "edges": [
            {
              "id": "edge_client_alb",
              "sources": ["external_client"],
              "targets": ["alb"],
              "labels": [{"text": "requests"}]
            },
            {
              "id": "edge_alb_ec2",
              "sources": ["alb"],
              "targets": ["ec2"],
              "labels": [{"text": "routes"}]
            },
            {
              "id": "edge_ec2_rds",
              "sources": ["ec2"],
              "targets": ["rds"],
              "labels": [{"text": "queries"}]
            }
          ]
        }
      ],
      "edges": []
    }
  },

  'multicloud-replica': {
    id: 'multicloud-replica',
    name: 'Multi-Cloud Setup',
    timestamp: new Date(Date.now() - 1000 * 60 * 10),
    rawGraph: {
      "id": "root",
      "children": [
        {
          "id": "external_clients",
          "labels": [{"text": "Users"}],
          "children": [
            {
              "id": "web_client",
              "labels": [{"text": "Web Client"}],
              "children": [],
              "edges": [],
              "data": {"icon": "browser_client"}
            },
            {
              "id": "mobile_client",
              "labels": [{"text": "Mobile Client"}],
              "children": [],
              "edges": [],
              "data": {"icon": "mobile_client"}
            }
          ],
          "edges": []
        },
        {
          "id": "aws_region",
          "labels": [{"text": "AWS (Primary)"}],
          "children": [
            {
              "id": "aws_api_gateway",
              "labels": [{"text": "API Gateway"}],
              "children": [],
              "edges": [],
              "data": {"icon": "aws_api_gateway"}
            },
            {
              "id": "aws_lambda",
              "labels": [{"text": "Lambda"}],
              "children": [],
              "edges": [],
              "data": {"icon": "aws_lambda"}
            }
          ],
          "edges": []
        },
        {
          "id": "gcp_region",
          "labels": [{"text": "GCP (Secondary)"}],
          "children": [
            {
              "id": "gcp_cloud_run",
              "labels": [{"text": "Cloud Run"}],
              "children": [],
              "edges": [],
              "data": {"icon": "gcp_cloud_run"}
            },
            {
              "id": "gcp_firestore",
              "labels": [{"text": "Firestore"}],
              "children": [],
              "edges": [],
              "data": {"icon": "gcp_firestore"}
            }
          ],
          "edges": []
        },
        {
          "id": "azure_region",
          "labels": [{"text": "Azure (DR)"}],
          "children": [
            {
              "id": "azure_functions",
              "labels": [{"text": "Azure Functions"}],
              "children": [],
              "edges": [],
              "data": {"icon": "azure_functions"}
            },
            {
              "id": "azure_cosmos",
              "labels": [{"text": "Cosmos DB"}],
              "children": [],
              "edges": [],
              "data": {"icon": "azure_cosmos_db"}
            }
          ],
          "edges": []
        }
      ],
      "edges": [
        {
          "id": "edge_web_aws",
          "sources": ["web_client"],
          "targets": ["aws_api_gateway"],
          "labels": [{"text": "primary"}]
        },
        {
          "id": "edge_mobile_gcp",
          "sources": ["mobile_client"],
          "targets": ["gcp_cloud_run"],
          "labels": [{"text": "secondary"}]
        },
        {
          "id": "edge_aws_gcp",
          "sources": ["aws_lambda"],
          "targets": ["gcp_firestore"],
          "labels": [{"text": "sync"}]
        }
      ]
    }
  }
};
