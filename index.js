const fetch = require('node-fetch');
const { backOff } = require('exponential-backoff');

const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_PAGES_PROJECT_NAME = process.env.CF_PAGES_PROJECT_NAME;
const CF_DELETE_ALIASED_DEPLOYMENTS = process.env.CF_DELETE_ALIASED_DEPLOYMENTS;

const MAX_ATTEMPTS = 5;

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const headers = {
  Authorization: `Bearer ${CF_API_TOKEN}`,
};

/** 获取生产环境的 deployment ID */
async function getProductionDeploymentId() {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${CF_PAGES_PROJECT_NAME}`,
    {
      method: 'GET',
      headers,
    }
  );
  const body = await response.json();
  if (!body.success) {
    throw new Error(body.errors[0].message);
  }
  const prodDeploymentId = body.result.canonical_deployment.id;
  if (!prodDeploymentId) {
    throw new Error('无法获取生产环境 deployment ID');
  }
  return prodDeploymentId;
}

async function deleteDeployment(id) {
  let params = '';
  if (CF_DELETE_ALIASED_DEPLOYMENTS === 'true') {
    params = '?force=true'; // 强制删除别名 deployment
  }
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${CF_PAGES_PROJECT_NAME}/deployments/${id}${params}`,
    {
      method: 'DELETE',
      headers,
    }
  );
  const body = await response.json();
  if (!body.success) {
    throw new Error(body.errors[0].message);
  }
  console.log(`已删除 deployment ${id}（项目：${CF_PAGES_PROJECT_NAME}）`);
}

async function listDeploymentsPerPage(page) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${CF_PAGES_PROJECT_NAME}/deployments?per_page=10&page=${page}`,
    {
      method: 'GET',
      headers,
    }
  );
  const body = await response.json();
  if (!body.success) {
    throw new Error(`无法获取项目 ${CF_PAGES_PROJECT_NAME} 的 deployments`);
  }
  return body.result;
}

async function listAllDeployments() {
  let page = 1;
  const deploymentIds = [];

  while (true) {
    let result;
    try {
      result = await backOff(() => listDeploymentsPerPage(page), {
        numOfAttempts: 5,
        startingDelay: 1000, // 延迟 1s
        retry: (_, attempt) => {
          console.warn(
            `获取第 ${page} 页 deployments 失败，重试中 (${attempt}/${MAX_ATTEMPTS})`
          );
          return true;
        },
      });
    } catch (err) {
      console.warn(`无法获取第 ${page} 页的 deployments`);
      console.warn(err);
      process.exit(1);
    }

    for (const deployment of result) {
      deploymentIds.push(deployment.id);
    }

    if (result.length) {
      page = page + 1;
      await sleep(500);
    } else {
      return deploymentIds;
    }
  }
}

async function main() {
  if (!CF_API_TOKEN) {
    throw new Error('请设置环境变量 CF_API_TOKEN（Cloudflare API Token）');
  }
  if (!CF_ACCOUNT_ID) {
    throw new Error('请设置环境变量 CF_ACCOUNT_ID（Cloudflare 账户 ID）');
  }
  if (!CF_PAGES_PROJECT_NAME) {
    throw new Error('请设置环境变量 CF_PAGES_PROJECT_NAME（Cloudflare Pages 项目名称）');
  }

  const productionDeploymentId = await getProductionDeploymentId();
  console.log(`生产环境 deployment（跳过删除）：${productionDeploymentId}`);

  console.log('正在列出所有 deployment，可能需要一些时间...');
  const deploymentIds = await listAllDeployments();

  for (const id of deploymentIds) {
    if (id === productionDeploymentId) {
      console.log(`跳过生产环境 deployment: ${id}`);
    } else {
      try {
        await deleteDeployment(id);
        await sleep(500);
      } catch (error) {
        console.log(error);
      }
    }
  }
}

main();
