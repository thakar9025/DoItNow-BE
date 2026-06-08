import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type SupportFaqItem = {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
};

type SupportContentResponse = {
  message: string;
  data: {
    supportEmail: string;
    faqs: SupportFaqItem[];
  };
};

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async getSupportContent(): Promise<SupportContentResponse> {
    const [settings, faqs] = await Promise.all([
      this.prisma.supportSetting.findUnique({
        where: { id: 'default' },
        select: { supportEmail: true },
      }),
      this.prisma.supportFaq.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          question: true,
          answer: true,
          sortOrder: true,
        },
      }),
    ]);

    if (!settings?.supportEmail?.trim()) {
      throw new InternalServerErrorException(
        'Support email is not configured',
      );
    }

    return {
      message: 'Support content fetched successfully',
      data: {
        supportEmail: settings.supportEmail.trim(),
        faqs: faqs.map((faq) => ({
          id: faq.id,
          question: faq.question,
          answer: faq.answer,
          sortOrder: faq.sortOrder,
        })),
      },
    };
  }
}
