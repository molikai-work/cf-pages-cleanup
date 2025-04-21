const fetch = require('node-fetch');
const { backOff } = require('exponential-backoff');
const pLimit = (await import('p-limit')).default;

const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_PAGES_PROJECT_NAMES = process.env.CF_PAGES_PROJECT_NAME.split(',');
const CF_DELETE_ALIASED_DEPLOYMENTS = process.env.CF_DELETE_ALIASED_DEPLOYMENTS;

const MAX_ATTEMPTS = 5;
const CONCURRENCY_LIMIT = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const headers = {
  Authorization: `Bearer ${CF_API_TOKEN}`,
};

/** 获取生产环境的部署 ID */
async function getProductionDeploymentId(projectName) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}`,
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
    throw new Error(`无法获取 ${projectName} 的生产环境部署 ID`);
  }
  return prodDeploymentId;
}

async function deleteDeployment(id, projectName) {
  let params = '';
  if (CF_DELETE_ALIASED_DEPLOYMENTS === 'true') {
    params = '?force=true';
  }

  await backOff(async () => {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}/deployments/${id}${params}`,
      {
        method: 'DELETE',
        headers,
      }
    );
    if (response.status === 429) {
      throw new Error('429 Too Many Requests');
    }
    const body = await response.json();
    if (!body.success) {
      throw new Error(body.errors[0].message);
    }
    console.log(`已删除 ${projectName} 的部署：${id}`);
  }, {
    numOfAttempts: MAX_ATTEMPTS,
    startingDelay: 1000, // 初始延迟 1s
    retry: (error, attempt) => {
      console.warn(`删除部署 ${id} 出现错误：${error.message}，重试中 (${attempt}/${MAX_ATTEMPTS})`);
      return true;
    }
  });
}

async function listDeploymentsPerPage(projectName, page) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}/deployments?per_page=10&page=${page}`,
    {
      method: 'GET',
      headers,
    }
  );
  const body = await response.json();
  if (!body.success) {
    throw new Error(`无法获取项目 ${projectName} 的部署 ID`);
  }
  return body.result;
}

async function listAllDeployments(projectName) {
  let page = 1;
  const deployments = [];

  while (true) {
    let result;
    try {
      result = await backOff(() => listDeploymentsPerPage(projectName, page), {
        numOfAttempts: MAX_ATTEMPTS,
        startingDelay: 1000,
        retry: (_, attempt) => {
          console.warn(`获取 ${projectName} 第 ${page} 页的部署 ID 失败，重试中 (${attempt}/${MAX_ATTEMPTS})`);
          return true;
        },
      });
    } catch (err) {
      console.warn(`无法获取 ${projectName} 第 ${page} 页的部署 ID`);
      console.warn(err);
      process.exit(1);
    }

    deployments.push(...result);

    if (result.length) {
      page++;
      await sleep(500);
    } else {
      return deployments;
    }
  }
}

async function processProject(projectName) {
  console.log(`开始处理项目：${projectName}`);
  
  const productionDeploymentId = await getProductionDeploymentId(projectName);
  console.log(`生产环境部署（跳过删除）：${productionDeploymentId}`);

  console.log(`正在列出 ${projectName} 的所有部署，这可能需要一些时间...`);
  const deployments = await listAllDeployments(projectName);

  const limit = pLimit(CONCURRENCY_LIMIT);

  const deleteTasks = deployments.map(deployment => {
    if (deployment.id === productionDeploymentId) {
      console.log(`跳过 ${projectName} 的生产环境部署：${deployment.id}`);
      return Promise.resolve();
    }
    return limit(() => deleteDeployment(deployment.id, projectName));
  });

  await Promise.all(deleteTasks);
}

async function main() {
  if (!CF_API_TOKEN) {
    throw new Error('请设置环境变量 CF_API_TOKEN（Cloudflare API Token）');
  }
  if (!CF_ACCOUNT_ID) {
    throw new Error('请设置环境变量 CF_ACCOUNT_ID（Cloudflare 账户 ID）');
  }
  if (!CF_PAGES_PROJECT_NAMES || CF_PAGES_PROJECT_NAMES.length === 0) {
    throw new Error('请设置环境变量 CF_PAGES_PROJECT_NAME（Cloudflare Pages 项目名称，多个项目名称用半角逗号隔开）');
  }

  for (const projectName of CF_PAGES_PROJECT_NAMES) {
    await processProject(projectName.trim());
  }

  console.log('\n所有项目均已处理完成');
}

main();
