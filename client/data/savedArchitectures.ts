import { DEFAULT_ARCHITECTURE } from './defaultArchitecture';

// Saved architecture variations for testing
export const SAVED_ARCHITECTURES = {
  'default': {
    id: 'default',
    name: 'Default GCP Architecture',
    timestamp: new Date(),
    rawGraph: DEFAULT_ARCHITECTURE
  },

  'lambda-web-stack': {
    id: 'lambda-web-stack',
    name: 'Lambda Web Stack',
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
    rawGraph: {
      "id": "root",
      "children": [
        {
          "id": "external_clients",
          "labels": [{"text": "Users"}],
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
              "id": "config_mgr",
              "labels": [{"text": "Config Manager"}],
              "children": [],
              "edges": [],
              "data": {"icon": "aws_config"}
            },
            {
              "id": "data_layer",
              "labels": [{"text": "Data Layer"}],
              "children": [],
              "edges": [],
              "data": {"icon": "aws_rds"}
            },
            {
              "id": "observability",
              "labels": [{"text": "Observability"}],
              "children": [],
              "edges": [],
              "data": {"icon": "aws_cloudwatch"}
            },
            {
              "id": "users",
              "labels": [{"text": "Users"}],
              "children": [],
              "edges": [],
              "data": {"icon": "aws_cognito"}
            },
            {
              "id": "storage_services",
              "labels": [{"text": "Storage Services"}],
              "children": [],
              "edges": [],
              "data": {"icon": "aws_s3"}
            },
            {
              "id": "compute_services",
              "labels": [{"text": "Compute Services"}],
              "children": [],
              "edges": [],
              "data": {"icon": "aws_lambda"}
            },
            {
              "id": "s3",
              "labels": [{"text": "S3"}],
              "children": [],
              "edges": [],
              "data": {"icon": "aws_s3"}
            },
            {
              "id": "edge",
              "labels": [{"text": "Edge"}],
              "children": [],
              "edges": [],
              "data": {"icon": "aws_cloudfront"}
            },
            {
              "id": "api_auth",
              "labels": [{"text": "API Auth"}],
              "children": [],
              "edges": [],
              "data": {"icon": "aws_api_gateway"}
            },
            {
              "id": "backend_services",
              "labels": [{"text": "Backend Services"}],
              "children": [],
              "edges": [],
              "data": {"icon": "aws_lambda"}
            },
            {
              "id": "cache",
              "labels": [{"text": "Cache"}],
              "children": [],
              "edges": [],
              "data": {"icon": "aws_elasticache"}
            },
            {
              "id": "data_stores",
              "labels": [{"text": "Data Stores"}],
              "children": [],
              "edges": [],
              "data": {"icon": "aws_dynamodb"}
            },
            {
              "id": "orchestration",
              "labels": [{"text": "Orchestration"}],
              "children": [],
              "edges": [],
              "data": {"icon": "aws_step_functions"}
            },
            {
              "id": "messaging",
              "labels": [{"text": "Messaging"}],
              "children": [],
              "edges": [],
              "data": {"icon": "aws_sqs"}
            },
            {
              "id": "external_services",
              "labels": [{"text": "External Services"}],
              "children": [],
              "edges": [],
              "data": {"icon": "aws_api_gateway"}
            }
          ],
          "edges": []
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
