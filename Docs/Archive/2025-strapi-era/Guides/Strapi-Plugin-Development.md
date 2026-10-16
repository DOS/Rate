# Strapi 5 Admin Panel Customization - Best Practices

## ⚠️ QUAN TRỌNG: Tránh DOM/CSS Injection

**ĐỪNG BAO GIỜ inject DOM hoặc CSS trực tiếp vào admin panel!**

### ❌ Approach SAI (dễ break):

```typescript
// ĐỪNG LÀM THẾ NÀY!
export default {
  bootstrap(app) {
    // ❌ Inject CSS vào head
    const style = document.createElement('style');
    style.textContent = '...';
    document.head.appendChild(style);

    // ❌ Query selector và modify DOM
    const element = document.querySelector('.strapi-header');
    element.innerHTML = '...';

    // ❌ Override Strapi components bằng DOM manipulation
    setInterval(() => {
      const button = document.querySelector('button[aria-label="Save"]');
      if (button) {
        button.onclick = customHandler;
      }
    }, 100);
  }
}
```

**Tại sao SAI:**
- Admin panel rebuild → selectors thay đổi → code break
- Strapi update → structure thay đổi → code break
- React reconciliation → DOM bị overwrite
- Performance issues (polling, memory leaks)
- Không type-safe, không có error handling
- Conflict với Strapi plugins khác

---

## ✅ Approach ĐÚNG: Sử dụng Strapi APIs

### 1. **Custom Fields (Plugin SDK)**

**Use case:** Thêm field types mới vào Content-Type Builder

```typescript
// apps/strapi/src/plugins/your-plugin/admin/src/index.tsx
export default {
  register(app: any) {
    app.customFields.register({
      name: 'field-name',
      pluginId: 'your-plugin',
      type: 'json',
      components: {
        Input: async () => import('./components/YourComponent'),
      },
      options: { /* ... */ }
    });
  }
};
```

**Ưu điểm:**
- ✅ Official API, stable across Strapi versions
- ✅ Type-safe với TypeScript
- ✅ Integrate sẵn với Content Manager
- ✅ Validation và error handling built-in

**Docs:** [Custom Fields Guide](https://docs.strapi.io/cms/plugins-development/guides/custom-fields)

---

### 2. **Admin Panel Extensions**

**Use case:** Thêm pages, modify menu, customize settings

```typescript
// apps/strapi/src/admin/app.tsx
export default {
  config: {
    // Customize existing pages
    translations: {
      en: {
        'app.components.LeftMenu.navbrand.title': 'Your Brand',
      }
    },

    // Theme customization
    theme: {
      light: {
        colors: {
          primary100: '#f6f6f9',
          primary600: '#4945ff',
        }
      }
    },

    // Add tutorial steps
    tutorials: false,

    // Notifications
    notifications: { releases: false }
  },

  bootstrap(app) {
    // Register new pages
    app.addMenuLink({
      to: '/plugins/your-plugin',
      icon: () => '📦',
      intlLabel: {
        id: 'your-plugin.menu',
        defaultMessage: 'Your Plugin',
      },
      Component: async () => import('./pages/YourPage'),
    });

    // Inject components vào specific zones
    app.getPlugin('content-manager').injectComponent('editView', 'right-links', {
      name: 'your-component',
      Component: async () => import('./components/EditViewButton'),
    });
  }
};
```

**Ưu điểm:**
- ✅ Official injection points
- ✅ React component-based
- ✅ Hot reload support
- ✅ No DOM manipulation

**Docs:** [Admin Panel API](https://docs.strapi.io/cms/customization/admin-panel)

---

### 3. **Lifecycle Hooks (Server-side Logic)**

**Use case:** Auto-populate fields, validation, side effects

```typescript
// apps/strapi/src/api/item/content-types/item/lifecycles.ts
export default {
  async beforeCreate(event) {
    const { data } = event.params;

    // Auto-populate từ related entity
    if (data.Category) {
      const category = await strapi.entityService.findOne(
        'api::category.category',
        data.Category,
        { fields: ['PropertyList'] }
      );

      if (category?.PropertyList) {
        const propertyList = JSON.parse(category.PropertyList);
        data.Properties = propertyList.map(comp => ({
          __component: comp,
          // default values
        }));
      }
    }
  },

  async afterCreate(event) {
    // Send notifications, update cache, etc.
  },

  async beforeUpdate(event) {
    // Validation, permission checks
  }
};
```

**Ưu điểm:**
- ✅ Server-side execution → reliable
- ✅ Không depend vào admin panel UI
- ✅ Work với cả API calls và admin panel
- ✅ Transaction-safe

**Docs:** [Lifecycle Hooks](https://docs.strapi.io/cms/plugins-development/server-api#lifecycle-hooks)

---

### 4. **Custom Controllers & Routes**

**Use case:** Custom business logic, API endpoints

```typescript
// apps/strapi/src/plugins/your-plugin/server/src/index.ts
const register = ({ strapi }: { strapi: Core.Strapi }) => {
  strapi.server.routes([
    {
      method: 'GET',
      path: '/your-plugin/custom-endpoint',
      handler: 'plugin::your-plugin.controller.customAction',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        auth: false,
      },
    },
  ]);
};

const controllers = {
  controller: {
    async customAction(ctx: any) {
      try {
        const result = await strapi.service('plugin::your-plugin.service').doSomething();
        ctx.body = { data: result };
      } catch (error) {
        ctx.throw(500, error);
      }
    }
  }
};

export default { register, controllers };
```

**Ưu điểm:**
- ✅ RESTful API design
- ✅ Authentication/authorization built-in
- ✅ Easy to test
- ✅ Can be called from admin panel components

**Docs:** [Server API](https://docs.strapi.io/cms/plugins-development/server-api)

---

### 5. **Middleware & Policies**

**Use case:** Request validation, logging, rate limiting

```typescript
// apps/strapi/src/middlewares/custom-middleware.ts
export default (config, { strapi }) => {
  return async (ctx, next) => {
    // Before request
    console.log('Request:', ctx.method, ctx.url);

    // Modify request
    if (ctx.request.body) {
      // Sanitize, validate, transform
    }

    await next();

    // After request
    console.log('Response:', ctx.status);
  };
};

// Register in config/middlewares.ts
export default [
  'strapi::errors',
  'strapi::security',
  'custom-middleware', // Your middleware
  'strapi::cors',
  // ...
];
```

**Docs:** [Middlewares](https://docs.strapi.io/cms/customization/config#middlewares)

---

## 🎯 Decision Tree: Chọn Approach Nào?

```
Bạn muốn...
│
├─ Thêm field type mới?
│  └─ ✅ Custom Field Plugin
│
├─ Thay đổi UI của admin panel?
│  ├─ Theme/colors/logo? → ✅ Admin Panel config (theme)
│  ├─ Thêm page mới? → ✅ Admin Panel Extensions (addMenuLink)
│  ├─ Modify existing page? → ✅ Injection Points (injectComponent)
│  └─ Custom layout hoàn toàn? → ✅ Create custom plugin với own routes
│
├─ Auto-populate fields khi tạo/update?
│  └─ ✅ Lifecycle Hooks (beforeCreate, beforeUpdate)
│
├─ Custom business logic?
│  └─ ✅ Services + Controllers
│
├─ Validate/modify requests?
│  └─ ✅ Middleware hoặc Policies
│
└─ Display data từ external API?
   └─ ✅ Custom Controller + fetch trong admin component
```

---

## 📚 Real-world Examples

### Example 1: Auto-populate Item Properties từ Category

**Requirement:** Khi tạo Item thuộc Category "Cellphones", tự động thêm Battery, Camera, Display components vào PropertyList.

**Solution:** Lifecycle Hook

```typescript
// apps/strapi/src/api/item/content-types/item/lifecycles.ts
export default {
  async beforeCreate(event) {
    const { data } = event.params;

    if (data.Category && !data.PropertyList?.length) {
      const category = await strapi.entityService.findOne(
        'api::category.category',
        data.Category,
        {
          fields: ['Property'],
          locale: event.params.locale
        }
      );

      if (category?.Property) {
        try {
          const propertyList = JSON.parse(category.Property);

          data.PropertyList = propertyList.map(componentName => ({
            __component: componentName,
            __temp_key__: Math.random(), // Strapi requirement
          }));

          strapi.log.info(`✅ Auto-populated ${propertyList.length} properties for Item`);
        } catch (err) {
          strapi.log.error('Failed to parse PropertyList:', err);
        }
      }
    }
  }
};
```

**Ưu điểm:**
- Work với cả admin panel và API calls
- Server-side → reliable
- Không depend vào UI changes

---

### Example 2: Custom Dropdown với Data từ External API

**Requirement:** Dropdown field hiển thị danh sách từ external API thay vì hardcoded options.

**Solution:** Custom Field + API Endpoint

```typescript
// 1. Server endpoint
// apps/strapi/src/plugins/your-plugin/server/src/controllers/controller.ts
export default {
  async getExternalData(ctx) {
    try {
      const response = await fetch('https://api.example.com/data');
      const data = await response.json();

      ctx.body = {
        options: data.map(item => ({
          value: item.id,
          label: item.name
        }))
      };
    } catch (error) {
      ctx.throw(500, 'Failed to fetch external data');
    }
  }
};

// 2. Component fetch data
// apps/strapi/src/plugins/your-plugin/admin/src/components/ExternalDropdown.tsx
const ExternalDropdown = ({ name, ... }) => {
  const { onChange, value } = useField(name);
  const { get } = useFetchClient();
  const [options, setOptions] = useState([]);

  useEffect(() => {
    const fetchOptions = async () => {
      const response = await get('/your-plugin/external-data');
      setOptions(response.data.options);
    };
    fetchOptions();
  }, [get]);

  return (
    <Field.Root>
      <Select value={value} onChange={(val) => onChange({ target: { name, value: val } })}>
        {options.map(opt => (
          <Option key={opt.value} value={opt.value}>{opt.label}</Option>
        ))}
      </Select>
    </Field.Root>
  );
};
```

---

### Example 3: Custom Validation với External Service

**Requirement:** Validate SKU field với external inventory API trước khi save.

**Solution:** Policy + Custom Controller

```typescript
// 1. Policy check
// apps/strapi/src/policies/validate-sku.ts
export default async (ctx, config, { strapi }) => {
  const { data } = ctx.request.body;

  if (data.SKU) {
    const isValid = await strapi
      .service('api::item.item')
      .validateSKU(data.SKU);

    if (!isValid) {
      return ctx.badRequest('SKU already exists in inventory system');
    }
  }

  return true;
};

// 2. Apply policy to routes
// apps/strapi/src/api/item/routes/item.ts
export default {
  routes: [
    {
      method: 'POST',
      path: '/items',
      handler: 'item.create',
      config: {
        policies: ['validate-sku'],
      },
    },
  ],
};
```

---

## 🔧 Debugging Tips

### 1. **Check Strapi logs**
```bash
# Server logs
tail -f apps/strapi/strapi-dev.log

# Browser console
# Admin panel URL: http://localhost:1337/admin
# Check Network tab for API calls
```

### 2. **Enable debug mode**
```typescript
// config/admin.ts
export default {
  config: {
    // Enable React DevTools
    reactDevtools: true,
  }
};
```

### 3. **Test APIs trước khi integrate**
```bash
# Test custom endpoint
curl http://localhost:1337/your-plugin/custom-endpoint

# Test with auth
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:1337/api/items
```

---

## 📖 Official Resources

- [Admin Panel Customization](https://docs.strapi.io/cms/customization/admin-panel)
- [Plugin Development](https://docs.strapi.io/cms/plugins-development/developing-plugins)
- [Server API](https://docs.strapi.io/cms/plugins-development/server-api)
- [Lifecycle Hooks](https://docs.strapi.io/cms/plugins-development/server-api#lifecycle-hooks)
- [Injection Points](https://docs.strapi.io/cms/customization/admin-panel#injection-zones)

---

## ✅ Checklist: Trước Khi Customize

- [ ] Đọc docs về feature cần customize
- [ ] Check có official API không (custom fields, injection points, lifecycle hooks)
- [ ] Tránh DOM/CSS injection → dùng Strapi APIs
- [ ] Test approach trên local trước
- [ ] Document approach và reasoning
- [ ] Test trên Strapi version mới (upgrade compatibility)

---

**Last updated:** 2025-10-12
**Strapi version:** 5.24.1+
