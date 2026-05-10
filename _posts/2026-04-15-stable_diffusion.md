---
title: 如何实现一个mini diffusion模型
author: ShijianWen
date: 2026-03-24
category: DL
layout: post
---

Diffusion 模型的核心思想很简单：**先把图片加噪到纯噪声，再学习如何逆向去噪**。

---

## 核心原理

整个过程分两步：

**前向过程（加噪）**：给原始图片 $x_0$ 逐步叠加高斯噪声，经过 $T$ 步后变成接近纯高斯噪声的 $x_T$。有个好用的闭合公式，可以直接从 $x_0$ 一步跳到任意时刻 $t$：

$$x_t = \sqrt{\bar{\alpha}_t}\, x_0 + \sqrt{1 - \bar{\alpha}_t}\, \epsilon, \quad \epsilon \sim \mathcal{N}(0, I)$$

其中 $\bar{\alpha}_t = \prod_{s=1}^{t}(1 - \beta_s)$，$\beta_t$ 是噪声强度的 schedule（从小到大线性增长）。

**反向过程（去噪）**：训练一个神经网络 $\epsilon_\theta(x_t, t)$，给它看加噪后的图和时间步 $t$，让它预测出被加进去的那个噪声 $\epsilon$。Loss 就是简单的 MSE：

$$\mathcal{L} = \mathbb{E}\left[\|\epsilon - \epsilon_\theta(x_t, t)\|^2\right]$$

---

## 代码实现

### 1. Beta Schedule 和 alpha_bar

```python
betas = torch.linspace(1e-4, 0.02, timesteps)   # 噪声从小到大
alphas = 1.0 - betas
alpha_bars = torch.cumprod(alphas, dim=0)         # 累积乘积
```

### 2. 加噪函数（前向一步到位）

```python
def add_noise(x0, t):
    noise = torch.randn_like(x0)
    alpha_bar = alpha_bars[t].view(-1, 1, 1, 1)
    xt = torch.sqrt(alpha_bar) * x0 + torch.sqrt(1 - alpha_bar) * noise
    return xt, noise
```

### 3. 网络结构

这里用了一个极简 CNN，实际项目里一般是 UNet（带 attention 和时间步 embedding）：

```python
class TinyDenoiser(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(1, 32, 3, padding=1), nn.ReLU(),
            nn.Conv2d(32, 32, 3, padding=1), nn.ReLU(),
            nn.Conv2d(32, 1, 3, padding=1)
        )
    def forward(self, x, t):
        return self.net(x)  # 注意：这里 t 还没真正用上
```

> ⚠️ **一个明显的简化**：`t` 被传入但没有注入网络。实际上时间步信息非常重要，正确做法是把 `t` 转成 sinusoidal embedding 后加到特征图上，否则模型不知道当前处于哪个噪声阶段。

### 4. 训练循环

```python
for images, _ in loader:
    t = torch.randint(0, timesteps, (images.shape[0],))
    xt, noise = add_noise(images, t)
    pred_noise = model(xt, t)
    loss = F.mse_loss(pred_noise, noise)
    optimizer.zero_grad(); loss.backward(); optimizer.step()
```

每次随机采样一批时间步，加噪后让模型预测噪声——就这么简单。

### 5. 采样（反向去噪）

训练完后，从纯噪声开始，逐步去噪生成图片：

```python
x = torch.randn(1, 1, 28, 28)
for t in reversed(range(timesteps)):
    z = torch.randn_like(x) if t > 0 else 0
    pred_noise = model(x, torch.tensor([t]))
    x = (1/torch.sqrt(alpha)) * (x - (1-alpha)/torch.sqrt(1-alpha_bar) * pred_noise) + torch.sqrt(beta) * z
```

这是 DDPM 的标准采样公式：每步减去预测噪声的贡献，再加一点随机性（最后一步不加）。

---

## 几个值得注意的地方

| 问题 | 原因 | 改进方向 |
|------|------|---------|
| 模型忽略了时间步 `t` | `forward` 里 `t` 没用 | 加 sinusoidal time embedding |
| 网络太浅 | TinyCNN 表达能力有限 | 换成 UNet |
| 采样慢 | DDPM 需要 T 步 | 用 DDIM 跳步采样 |

---

## 总结

Diffusion 的精髓就三行话：

1. 加噪可以用公式一步搞定
2. 训练目标是让网络学会预测噪声
3. 生成时反复去噪，从噪声还原图片

代码层面并不复杂，真正拉开效果差距的是网络结构（UNet）、时间步编码和采样策略。